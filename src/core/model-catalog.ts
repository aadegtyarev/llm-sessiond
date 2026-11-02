export interface CatalogModel {
  provider: string;
  id: string;
  name: string;
}

export interface ModelCatalog {
  models: CatalogModel[];
  current?: CatalogModel;
}

export interface ModelCatalogExecutionPort {
  readModelCatalog(): Promise<unknown>;
}

function invalid(): never {
  throw new Error("INVALID_MODEL_CATALOG");
}
function record(value: unknown, allowed: string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return invalid();
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string" || !allowed.includes(key)))
    return invalid();
  const result: Record<string, unknown> = {};
  for (const key of keys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) return invalid();
    result[key] = descriptor.value;
  }
  return result;
}
function model(value: unknown): CatalogModel {
  const source = record(value, ["provider", "id", "name"]);
  if (
    typeof source.provider !== "string" ||
    typeof source.id !== "string" ||
    typeof source.name !== "string"
  )
    return invalid();
  return { provider: source.provider, id: source.id, name: source.name };
}
export function snapshotModelCatalog(value: unknown): ModelCatalog {
  const source = record(value, ["models", "current"]);
  if (!Array.isArray(source.models)) return invalid();
  const keys = Reflect.ownKeys(source.models);
  if (keys.length !== source.models.length + 1 || !keys.includes("length"))
    return invalid();
  const models: CatalogModel[] = [];
  for (let index = 0; index < source.models.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(
      source.models,
      String(index),
    );
    if (!descriptor || !("value" in descriptor)) return invalid();
    models.push(model(descriptor.value));
  }
  const result: ModelCatalog = { models };
  if (Object.hasOwn(source, "current")) result.current = model(source.current);
  return result;
}
