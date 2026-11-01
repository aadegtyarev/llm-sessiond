import { validateJson } from "../core/json-bounds.js";
import type { AdapterCheckpoint } from "../core/adapter-contracts.js";
import type { JsonValue } from "../core/generic-json.js";
import { SafeValidationError } from "../core/generic-json.js";

export function encodeOptions(value: JsonValue | undefined): string | null {
  if (value === undefined) return null;
  validateJson(value, 8192, 5);
  return JSON.stringify(value);
}
export function encodeCheckpoint(value: AdapterCheckpoint | undefined): string | null {
  if (value === undefined) return null;
  if (!value || Object.keys(value).sort().join(",") !== "data,namespace,version" || !value.namespace || !Number.isSafeInteger(value.version) || value.version < 1) throw new SafeValidationError("INVALID_CHECKPOINT");
  validateJson(value, 65536, 20);
  return JSON.stringify(value);
}
