import { validateJson } from "./json-bounds.js";
import { SafeValidationError, type JsonValue } from "./generic-json.js";
import type { HarnessAdapter } from "./adapter-contracts.js";

export function validateExtensionPayload(adapter: HarnessAdapter, namespace: string, version: number, kind: "request" | "result" | "event", value: JsonValue): { version: number; value: JsonValue } {
  validateJson(value, 65536, 20);
  const descriptor = adapter.descriptor.extensions?.find((entry) => entry.namespace === namespace);
  if (!descriptor) throw new SafeValidationError("UNKNOWN_EXTENSION_NAMESPACE");
  let current = { version, value };
  if (version !== descriptor.version) {
    if (version > descriptor.version || !adapter.migrateExtension) throw new SafeValidationError("UNKNOWN_EXTENSION_VERSION");
    const migrated = adapter.migrateExtension(namespace, version, kind, value);
    if (!migrated || migrated.version !== descriptor.version) throw new SafeValidationError("EXTENSION_MIGRATION_FAILED");
    current = migrated;
  }
  if (!adapter.validateExtension?.(namespace, current.version, kind, current.value)) throw new SafeValidationError("INVALID_EXTENSION_PAYLOAD");
  return current;
}
