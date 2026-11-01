import { SafeValidationError, type JsonValue } from "./generic-json.js";

const SECRET_KEY =
  /(secret|token|password|credential|api[_-]?key|private[_-]?key)/i;
export function validateJson(
  value: unknown,
  maxBytes: number,
  maxDepth: number,
): asserts value is JsonValue {
  const seen = new Set<object>();
  const visit = (item: unknown, depth: number): void => {
    if (depth > maxDepth) throw new SafeValidationError("JSON_DEPTH_LIMIT");
    if (item === null || typeof item === "string" || typeof item === "boolean")
      return;
    if (typeof item === "number" && Number.isFinite(item)) return;
    if (
      typeof item !== "object" ||
      seen.has(item) ||
      Object.getOwnPropertySymbols(item).length
    )
      throw new SafeValidationError("INVALID_JSON");
    seen.add(item);
    if (Array.isArray(item)) {
      const names = Object.getOwnPropertyNames(item);
      if (
        names.length !== item.length + 1 ||
        names.some((key) => key !== "length" && !/^(0|[1-9][0-9]*)$/.test(key))
      )
        throw new SafeValidationError("INVALID_JSON");
      for (let index = 0; index < item.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
          throw new SafeValidationError("INVALID_JSON");
        visit(descriptor.value, depth + 1);
      }
    } else {
      if (
        Object.getPrototypeOf(item) !== Object.prototype &&
        Object.getPrototypeOf(item) !== null
      )
        throw new SafeValidationError("INVALID_JSON");
      for (const key of Object.getOwnPropertyNames(item)) {
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
          throw new SafeValidationError("INVALID_JSON");
        if (SECRET_KEY.test(key))
          throw new SafeValidationError("SECRET_KEY_FORBIDDEN");
        visit(descriptor.value, depth + 1);
      }
    }
    seen.delete(item);
  };
  try {
    visit(value, 0);
  } catch (error) {
    if (error instanceof SafeValidationError) throw error;
    throw new SafeValidationError("INVALID_JSON");
  }
  let encoded: string;
  try {
    encoded = JSON.stringify(value);
  } catch {
    throw new SafeValidationError("INVALID_JSON");
  }
  if (Buffer.byteLength(encoded) > maxBytes)
    throw new SafeValidationError("JSON_SIZE_LIMIT");
}
export function parseBoundedJson(
  text: string,
  maxBytes: number,
  maxDepth: number,
): JsonValue {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SafeValidationError("INVALID_JSON");
  }
  validateJson(parsed, maxBytes, maxDepth);
  return parsed;
}
