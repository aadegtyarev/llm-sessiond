import { validateJson } from "./json-bounds.js";
import { SafeValidationError, type JsonValue } from "./generic-json.js";
import type { HarnessAdapter } from "./adapter-contracts.js";

export function validateExtensionPayload(
  adapter: HarnessAdapter,
  namespace: string,
  version: number,
  kind: "request" | "result" | "event",
  name: string,
  value: unknown,
): { version: number; value: JsonValue } {
  if (!Number.isSafeInteger(version) || version < 1)
    throw new SafeValidationError("UNKNOWN_EXTENSION_VERSION");
  validateJson(value, 65536, 20);
  const descriptor = adapter.descriptor.extensions?.find(
    (entry) => entry.namespace === namespace,
  );
  if (!descriptor) throw new SafeValidationError("UNKNOWN_EXTENSION_NAMESPACE");
  const registered =
    kind === "event"
      ? descriptor.events.includes(name)
      : descriptor.operations.some((operation) => operation.name === name);
  if (!registered) throw new SafeValidationError("UNKNOWN_EXTENSION_OPERATION");
  let current = { version, value };
  if (version !== descriptor.version) {
    if (version > descriptor.version || !adapter.migrateExtension)
      throw new SafeValidationError("UNKNOWN_EXTENSION_VERSION");
    let migrated: { version: number; value: JsonValue } | undefined;
    try {
      migrated = adapter.migrateExtension(
        namespace,
        version,
        kind,
        name,
        value,
      );
    } catch {
      throw new SafeValidationError("EXTENSION_MIGRATION_FAILED");
    }
    validateMigrationEnvelope(migrated, descriptor.version);
    current = migrated;
  }
  let valid = false;
  try {
    valid =
      adapter.validateExtension?.(
        namespace,
        current.version,
        kind,
        name,
        current.value,
      ) ?? false;
  } catch {
    throw new SafeValidationError("INVALID_EXTENSION_PAYLOAD");
  }
  if (!valid) throw new SafeValidationError("INVALID_EXTENSION_PAYLOAD");
  return current;
}
function validateMigrationEnvelope(
  value: unknown,
  expectedVersion: number,
): asserts value is { version: number; value: JsonValue } {
  if (!value || typeof value !== "object")
    throw new SafeValidationError("EXTENSION_MIGRATION_FAILED");
  validateJson(value, 65536, 20);
  if (Array.isArray(value))
    throw new SafeValidationError("EXTENSION_MIGRATION_FAILED");
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).sort().join(",") !== "value,version" ||
    !Number.isSafeInteger(row.version) ||
    row.version !== expectedVersion
  )
    throw new SafeValidationError("EXTENSION_MIGRATION_FAILED");
}
