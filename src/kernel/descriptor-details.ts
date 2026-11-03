import type {
  HarnessExtension,
  HarnessOption,
} from "../interfaces/runtime-data.js";
const NAME = /^[a-z][a-z0-9._-]{0,127}$/;
type RecordValue = Record<string, unknown>;
function isRecord(value: unknown): value is RecordValue {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function only(value: RecordValue, allowed: string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

export function validateOptions(value: unknown): HarnessOption[] {
  if (!Array.isArray(value)) throw new Error("Invalid harness descriptor");
  const result = value.map((entry) => {
    if (
      !isRecord(entry) ||
      !only(entry, [
        "key",
        "label",
        "values",
        "allowCustom",
        "defaultValue",
        "dangerousValues",
      ]) ||
      typeof entry.key !== "string" ||
      !NAME.test(entry.key) ||
      typeof entry.label !== "string" ||
      !Array.isArray(entry.values)
    )
      throw new Error("Invalid harness descriptor");
    if (
      entry.allowCustom !== undefined &&
      typeof entry.allowCustom !== "boolean"
    )
      throw new Error("Invalid harness descriptor");
    if (
      entry.dangerousValues !== undefined &&
      !Array.isArray(entry.dangerousValues)
    )
      throw new Error("Invalid harness descriptor");
    return entry as unknown as HarnessOption;
  });
  if (new Set(result.map((item) => item.key)).size !== result.length)
    throw new Error("Invalid harness descriptor");
  return result;
}

export function validateExtensions(value: unknown): HarnessExtension[] {
  if (!Array.isArray(value)) throw new Error("Invalid harness descriptor");
  const result = value.map((entry) => {
    if (
      !isRecord(entry) ||
      !only(entry, ["namespace", "version", "operations", "events"]) ||
      typeof entry.namespace !== "string" ||
      !NAME.test(entry.namespace) ||
      !Number.isSafeInteger(entry.version) ||
      Number(entry.version) < 1 ||
      !Array.isArray(entry.operations) ||
      !Array.isArray(entry.events) ||
      entry.events.some(
        (event) => typeof event !== "string" || !NAME.test(event),
      )
    )
      throw new Error("Invalid harness descriptor");
    for (const operation of entry.operations)
      if (
        !isRecord(operation) ||
        !only(operation, ["name", "effect", "guardRequired"]) ||
        typeof operation.name !== "string" ||
        !NAME.test(operation.name) ||
        !["read", "write"].includes(String(operation.effect)) ||
        typeof operation.guardRequired !== "boolean"
      )
        throw new Error("Invalid harness descriptor");
    if (
      new Set(
        (entry.operations as Array<{ name: string }>).map((item) => item.name),
      ).size !== entry.operations.length ||
      new Set(entry.events).size !== entry.events.length
    )
      throw new Error("Invalid harness descriptor");
    return entry as unknown as HarnessExtension;
  });
  if (
    new Set(result.map((item) => `${item.namespace}:${item.version}`)).size !==
    result.length
  )
    throw new Error("Invalid harness descriptor");
  return result;
}
