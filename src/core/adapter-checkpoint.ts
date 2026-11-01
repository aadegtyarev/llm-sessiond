import { validateCheckpointEnvelope } from "./durable-validation.js";
import { SafeValidationError, type JsonValue } from "./generic-json.js";
import type { AdapterCheckpoint, HarnessAdapter } from "./adapter-contracts.js";

export function validateCheckpoint(
  input: unknown,
  adapter: HarnessAdapter,
): AdapterCheckpoint {
  validateCheckpointEnvelope(input);
  const checkpoint = input;
  const declared = adapter.checkpoint;
  if (!declared || declared.namespace !== checkpoint.namespace)
    throw new SafeValidationError("UNKNOWN_CHECKPOINT_NAMESPACE");
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
  try {
    validateCheckpointEnvelope(migrated);
  } catch {
    throw new SafeValidationError("CHECKPOINT_MIGRATION_FAILED");
  }
  if (
    migrated.namespace !== declared.namespace ||
    migrated.version !== declared.version
  )
    throw new SafeValidationError("CHECKPOINT_MIGRATION_FAILED");
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
