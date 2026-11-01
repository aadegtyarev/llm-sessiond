import { validateCheckpointEnvelope } from "../core/durable-validation.js";
import { validateJson } from "../core/json-bounds.js";
import type { AdapterCheckpoint } from "../core/adapter-contracts.js";
import type { JsonValue } from "../core/generic-json.js";

export function encodeOptions(value: JsonValue | undefined): string | null {
  if (value === undefined) return null;
  validateJson(value, 8192, 5);
  return JSON.stringify(value);
}
export function encodeCheckpoint(
  value: AdapterCheckpoint | undefined,
): string | null {
  if (value === undefined) return null;
  validateCheckpointEnvelope(value);
  return JSON.stringify(value);
}
