import { validateJson } from "./json-bounds.js";
import { SafeValidationError } from "./generic-json.js";
import type { AdapterCheckpoint } from "./adapter-contracts.js";

export const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const NAMESPACE = /^[a-z][a-z0-9._-]{0,127}$/;
export function validateSessionId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !OPAQUE_ID.test(value))
    throw new SafeValidationError("INVALID_SESSION_ID");
}
export function validateHarnessId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !OPAQUE_ID.test(value))
    throw new SafeValidationError("INVALID_HARNESS_ID");
}
export function validateCheckpointEnvelope(
  value: unknown,
): asserts value is AdapterCheckpoint {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new SafeValidationError("INVALID_CHECKPOINT");
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).sort().join(",") !== "data,namespace,version" ||
    typeof row.namespace !== "string" ||
    !NAMESPACE.test(row.namespace) ||
    !Number.isSafeInteger(row.version) ||
    (row.version as number) < 1
  )
    throw new SafeValidationError("INVALID_CHECKPOINT");
  validateJson(value, 65536, 20);
}
