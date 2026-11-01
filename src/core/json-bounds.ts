import { SafeValidationError, type JsonValue } from "./generic-json.js";

const SECRET_KEY = /(secret|token|password|credential|api[_-]?key|private[_-]?key)/i;
export function validateJson(value: unknown, maxBytes: number, maxDepth: number): asserts value is JsonValue {
  const seen = new Set<object>();
  const visit = (item: unknown, depth: number): void => {
    if (depth > maxDepth) throw new SafeValidationError("JSON_DEPTH_LIMIT");
    if (item === null || typeof item === "string" || typeof item === "boolean") return;
    if (typeof item === "number" && Number.isFinite(item)) return;
    if (typeof item !== "object" || seen.has(item)) throw new SafeValidationError("INVALID_JSON");
    seen.add(item);
    if (Array.isArray(item)) item.forEach((part) => visit(part, depth + 1));
    else for (const [key, part] of Object.entries(item)) {
      if (SECRET_KEY.test(key)) throw new SafeValidationError("SECRET_KEY_FORBIDDEN");
      visit(part, depth + 1);
    }
    seen.delete(item);
  };
  visit(value, 0);
  let encoded: string;
  try { encoded = JSON.stringify(value); } catch { throw new SafeValidationError("INVALID_JSON"); }
  if (Buffer.byteLength(encoded) > maxBytes) throw new SafeValidationError("JSON_SIZE_LIMIT");
}
export function parseBoundedJson(text: string, maxBytes: number, maxDepth: number): JsonValue {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new SafeValidationError("INVALID_JSON"); }
  validateJson(parsed, maxBytes, maxDepth);
  return parsed;
}
