import { readFile } from "node:fs/promises";
import type {
  HarnessAdapter,
  HarnessDescriptor,
} from "../src/core/adapter-contracts.js";
import type { JsonValue } from "../src/core/generic-json.js";

type Kind = "request" | "result" | "event";
type Validator = (value: JsonValue) => boolean;
function field(value: JsonValue, key: string): JsonValue | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  return value[key];
}
function shape(
  value: JsonValue,
  key: string,
  test: (value: JsonValue) => boolean,
): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === key &&
    test(field(value, key)!)
  );
}
const validators: Record<string, Validator> = {
  "request:inspect": (value) =>
    shape(value, "scope", (item) => typeof item === "string"),
  "request:apply": (value) =>
    shape(value, "enabled", (item) => typeof item === "boolean"),
  "result:inspect": (value) =>
    shape(value, "items", (item) => typeof item === "number"),
  "result:apply": (value) =>
    shape(value, "applied", (item) => typeof item === "boolean"),
  "event:audit.finished": (value) =>
    shape(value, "count", (item) => typeof item === "number"),
  "event:audit.started": (value) =>
    shape(value, "scope", (item) => typeof item === "string"),
};
const migrations: Record<string, (value: JsonValue) => JsonValue | undefined> =
  {
    "request:inspect": (value) =>
      shape(value, "legacyScope", (x) => typeof x === "string")
        ? { scope: field(value, "legacyScope")! }
        : undefined,
    "request:apply": (value) =>
      shape(value, "legacyEnabled", (x) => typeof x === "boolean")
        ? { enabled: field(value, "legacyEnabled")! }
        : undefined,
    "result:inspect": (value) =>
      shape(value, "legacyItems", (x) => typeof x === "number")
        ? { items: field(value, "legacyItems")! }
        : undefined,
    "result:apply": (value) =>
      shape(value, "legacyApplied", (x) => typeof x === "boolean")
        ? { applied: field(value, "legacyApplied")! }
        : undefined,
    "event:audit.finished": (value) =>
      shape(value, "legacyCount", (x) => typeof x === "number")
        ? { count: field(value, "legacyCount")! }
        : undefined,
    "event:audit.started": (value) =>
      shape(value, "legacyScope", (x) => typeof x === "string")
        ? { scope: field(value, "legacyScope")! }
        : undefined,
  };
export async function syntheticExtensionAdapter(): Promise<HarnessAdapter> {
  const path = new URL(
    "./fixtures/v2/contracts/synthetic-harness.json",
    import.meta.url,
  );
  const fixture = JSON.parse(await readFile(path, "utf8")) as {
    descriptor: HarnessDescriptor;
  };
  return {
    descriptor: fixture.descriptor,
    checkpoint: { namespace: "third-harness.audit", version: 3 },
    validateCheckpoint: (value) =>
      !!value && typeof value === "object" && !Array.isArray(value),
    validateExtension: (_namespace, version, kind: Kind, name, value) =>
      version === 7 && !!validators[`${kind}:${name}`]?.(value),
    migrateExtension: (_namespace, from, kind: Kind, name, value) => {
      if (from !== 6) return undefined;
      const migrated = migrations[`${kind}:${name}`]?.(value);
      return migrated === undefined
        ? undefined
        : { version: 7, value: migrated };
    },
  };
}
