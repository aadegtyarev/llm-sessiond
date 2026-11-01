import { validateJson } from "./json-bounds.js";
import { SafeValidationError, type JsonValue } from "./generic-json.js";
import type { AdapterCheckpoint, HarnessAdapter } from "./adapter-contracts.js";

export function validateCheckpoint(
  input: unknown,
  adapter: HarnessAdapter,
): AdapterCheckpoint {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new SafeValidationError("INVALID_CHECKPOINT");
  const row = input as Record<string, unknown>;
  if (
    Object.keys(row).sort().join(",") !== "data,namespace,version" ||
    typeof row.namespace !== "string" ||
    !Number.isSafeInteger(row.version) ||
    (row.version as number) < 1
  )
    throw new SafeValidationError("INVALID_CHECKPOINT");
  validateJson(row.data, 65536, 20);
  const declared = adapter.checkpoint;
  if (!declared || declared.namespace !== row.namespace)
    throw new SafeValidationError("UNKNOWN_CHECKPOINT_NAMESPACE");
  const checkpoint = {
    namespace: row.namespace,
    version: row.version as number,
    data: row.data as JsonValue,
  };
  if (checkpoint.version === declared.version) {
    if (!runValidator(adapter, checkpoint.data))
      throw new SafeValidationError("INVALID_CHECKPOINT");
    return checkpoint;
  }
  if (checkpoint.version > declared.version || !adapter.migrateCheckpoint)
    throw new SafeValidationError("UNKNOWN_CHECKPOINT_VERSION");
  let migrated: AdapterCheckpoint | undefined;
  try {
    migrated = adapter.migrateCheckpoint(checkpoint.version, checkpoint.data);
  } catch {
    throw new SafeValidationError("CHECKPOINT_MIGRATION_FAILED");
  }
  if (
    !migrated ||
    migrated.namespace !== declared.namespace ||
    migrated.version !== declared.version
  )
    throw new SafeValidationError("CHECKPOINT_MIGRATION_FAILED");
  validateJson(migrated.data, 65536, 20);
  if (!runValidator(adapter, migrated.data))
    throw new SafeValidationError("INVALID_CHECKPOINT");
  return migrated;
}
function runValidator(adapter: HarnessAdapter, value: JsonValue): boolean {
  try {
    return adapter.validateCheckpoint(value);
  } catch {
    throw new SafeValidationError("INVALID_CHECKPOINT");
  }
}
