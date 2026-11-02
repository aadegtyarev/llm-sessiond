import { descriptorSchema } from "../core/adapter-descriptor-schema.js";
import { validateJson } from "../core/json-bounds.js";

export function snapshotDiscoveryDescriptor(source: unknown) {
  const snapshot = copyPlainDescriptorData(source, new Set<object>());
  const descriptor = descriptorSchema.parse(snapshot);
  if (descriptor.options !== undefined)
    validateJson(descriptor.options, 8192, 5);
  return descriptor;
}

function copyPlainDescriptorData(
  value: unknown,
  ancestors: Set<object>,
): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object" || ancestors.has(value))
    throw new TypeError("invalid descriptor data");
  ancestors.add(value);
  try {
    if (Object.getOwnPropertySymbols(value).length !== 0)
      throw new TypeError("invalid descriptor data");
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype)
        throw new TypeError("invalid descriptor array");
      const keys = Object.getOwnPropertyNames(value);
      if (keys.length !== value.length + 1)
        throw new TypeError("invalid descriptor array");
      const result: unknown[] = [];
      for (let index = 0; index < value.length; index++) {
        const item = Object.getOwnPropertyDescriptor(value, String(index));
        if (!item?.enumerable || !("value" in item))
          throw new TypeError("invalid descriptor array");
        result.push(copyPlainDescriptorData(item.value, ancestors));
      }
      return result;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
      throw new TypeError("invalid descriptor object");
    const result: Record<string, unknown> = Object.create(null);
    for (const key of Object.getOwnPropertyNames(value)) {
      const item = Object.getOwnPropertyDescriptor(value, key);
      if (!item?.enumerable || !("value" in item))
        throw new TypeError("invalid descriptor object");
      Object.defineProperty(result, key, {
        value: copyPlainDescriptorData(item.value, ancestors),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}
