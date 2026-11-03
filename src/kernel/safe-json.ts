export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const SECRET =
  /(secret|token|password|credential|api[_-]?key|private[_-]?key)/i;

export function copySafeJson(
  value: unknown,
  maxBytes: number,
  maxDepth: number,
): JsonValue {
  let size = 0;
  const seen = new Set<object>();
  const visit = (item: unknown, depth: number): JsonValue => {
    if (depth > maxDepth) throw new Error("Invalid JSON");
    if (
      item === null ||
      typeof item === "string" ||
      typeof item === "boolean"
    ) {
      size += typeof item === "string" ? Buffer.byteLength(item) : 4;
      return item;
    }
    if (typeof item === "number" && Number.isFinite(item)) {
      size += 8;
      return item;
    }
    if (
      !item ||
      typeof item !== "object" ||
      seen.has(item) ||
      Object.getOwnPropertySymbols(item).length
    )
      throw new Error("Invalid JSON");
    seen.add(item);
    if (Array.isArray(item)) {
      const names = Object.getOwnPropertyNames(item);
      if (
        names.length !== item.length + 1 ||
        names.some((key) => key !== "length" && !/^(0|[1-9][0-9]*)$/.test(key))
      )
        throw new Error("Invalid JSON");
      const result: JsonValue[] = [];
      for (let index = 0; index < item.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
        if (!descriptor || !("value" in descriptor))
          throw new Error("Invalid JSON");
        result.push(visit(descriptor.value, depth + 1));
      }
      seen.delete(item);
      return result;
    }
    if (
      Object.getPrototypeOf(item) !== Object.prototype &&
      Object.getPrototypeOf(item) !== null
    )
      throw new Error("Invalid JSON");
    const names = Object.getOwnPropertyNames(item);
    if (names.length !== Object.keys(item).length)
      throw new Error("Invalid JSON");
    const result: Record<string, JsonValue> = {};
    for (const key of names) {
      if (SECRET.test(key)) throw new Error("Invalid JSON");
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor || !("value" in descriptor))
        throw new Error("Invalid JSON");
      size += Buffer.byteLength(key);
      result[key] = visit(descriptor.value, depth + 1);
    }
    seen.delete(item);
    return result;
  };
  try {
    const result = visit(value, 0);
    if (size > maxBytes || Buffer.byteLength(JSON.stringify(result)) > maxBytes)
      throw new Error("Invalid JSON");
    return result;
  } catch {
    throw new Error("Invalid JSON");
  }
}
