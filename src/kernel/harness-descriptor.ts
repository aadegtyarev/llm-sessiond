import type { HarnessDescriptor } from "../interfaces/runtime-data.js";
import { validateExtensions, validateOptions } from "./descriptor-details.js";
import { copySafeJson } from "./safe-json.js";

const NAME = /^[a-z][a-z0-9._-]{0,127}$/;

export function snapshotDescriptor(value: unknown): HarnessDescriptor {
  const safe = copySafeJson(value, 65536, 8);
  if (
    !isRecord(safe) ||
    !only(safe, [
      "id",
      "aliases",
      "capabilities",
      "metadata",
      "options",
      "extensions",
    ])
  )
    throw new Error("Invalid harness descriptor");
  const { id, aliases, capabilities } = safe;
  if (
    typeof id !== "string" ||
    !NAME.test(id) ||
    !strings(aliases) ||
    !strings(capabilities)
  )
    throw new Error("Invalid harness descriptor");
  if (
    new Set(aliases).size !== aliases.length ||
    new Set(capabilities).size !== capabilities.length ||
    aliases.some((name) => !NAME.test(name))
  )
    throw new Error("Invalid harness descriptor");
  if (
    capabilities.some(
      (name) =>
        !/^[a-z][a-z0-9.-]+$/.test(name) &&
        !/^[a-z][a-z0-9._-]*\/[a-z][a-z0-9._-]*$/.test(name),
    )
  )
    throw new Error("Invalid harness descriptor");
  const descriptor: HarnessDescriptor = { id, aliases, capabilities };
  if (safe.metadata !== undefined) {
    if (
      !isRecord(safe.metadata) ||
      Object.keys(safe.metadata).some((key) => !NAME.test(key)) ||
      Object.values(safe.metadata).some((entry) => typeof entry !== "string")
    )
      throw new Error("Invalid harness descriptor");
    descriptor.metadata = safe.metadata as Record<string, string>;
  }
  if (safe.options !== undefined)
    descriptor.options = validateOptions(safe.options);
  if (safe.extensions !== undefined)
    descriptor.extensions = validateExtensions(safe.extensions);
  return descriptor;
}

function strings(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function only(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}
