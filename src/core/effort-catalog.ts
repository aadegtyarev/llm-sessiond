export interface EffortCatalog {
  levels: string[];
  current?: string;
}

export interface EffortCatalogExecutionPort {
  readEffortCatalog(): Promise<unknown>;
}

function invalid(): never {
  throw new Error("INVALID_EFFORT_CATALOG");
}

export function snapshotEffortCatalog(value: unknown): EffortCatalog {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return invalid();
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => key !== "levels" && key !== "current"))
    return invalid();
  const source: Record<string, unknown> = {};
  for (const key of keys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) return invalid();
    source[key] = descriptor.value;
  }
  if (!Array.isArray(source.levels)) return invalid();
  const arrayKeys = Reflect.ownKeys(source.levels);
  if (
    arrayKeys.length !== source.levels.length + 1 ||
    !arrayKeys.includes("length")
  )
    return invalid();
  const levels: string[] = [];
  for (let index = 0; index < source.levels.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(
      source.levels,
      String(index),
    );
    if (
      !descriptor ||
      !("value" in descriptor) ||
      typeof descriptor.value !== "string"
    )
      return invalid();
    levels.push(descriptor.value);
  }
  const result: EffortCatalog = { levels };
  if (Object.hasOwn(source, "current")) {
    if (typeof source.current !== "string") return invalid();
    result.current = source.current;
  }
  return result;
}
