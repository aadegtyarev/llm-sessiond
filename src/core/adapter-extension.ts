import { validateJson } from "./json-bounds.js";
import { SafeValidationError, type JsonValue } from "./generic-json.js";
import type { HarnessAdapter } from "./adapter-contracts.js";

export function validateExtensionPayload(
  adapter: HarnessAdapter,
  namespace: string,
  version: number,
  kind: "request" | "result" | "event",
  name: string,
  value: JsonValue,
): { version: number; value: JsonValue } {
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
      migrated = adapter.migrateExtension(namespace, version, kind, value);
    } catch {
      throw new SafeValidationError("EXTENSION_MIGRATION_FAILED");
    }
    if (!migrated || migrated.version !== descriptor.version)
      throw new SafeValidationError("EXTENSION_MIGRATION_FAILED");
    current = migrated;
  }
  let valid = false;
  try {
    valid =
      adapter.validateExtension?.(
        namespace,
        current.version,
        kind,
        current.value,
      ) ?? false;
  } catch {
    throw new SafeValidationError("INVALID_EXTENSION_PAYLOAD");
  }
  if (!valid) throw new SafeValidationError("INVALID_EXTENSION_PAYLOAD");
  return current;
}
