import type { ModelCatalog } from "../core/model-catalog.js";
import type { PiDurableRpcLink } from "./pi-durable-rpc-link.js";

export async function readPiModelCatalog(
  link: PiDurableRpcLink,
  isCurrent: () => boolean,
): Promise<ModelCatalog> {
  if (!link.writable || !isCurrent()) throw new Error("RPC_UNAVAILABLE");
  const reply = await link.command("get_available_models", {});
  if (!link.writable || !isCurrent()) throw new Error("RPC_UNAVAILABLE");
  const data = controlData(reply);
  if (!Array.isArray(data.models)) throw new Error("INVALID_MODEL_CATALOG");
  const keys = Reflect.ownKeys(data.models);
  if (keys.length !== data.models.length + 1 || !keys.includes("length"))
    throw new Error("INVALID_MODEL_CATALOG");
  const models: ReturnType<typeof projectModel>[] = [];
  for (let index = 0; index < data.models.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(
      data.models,
      String(index),
    );
    if (!descriptor || !("value" in descriptor))
      throw new Error("INVALID_MODEL_CATALOG");
    models.push(projectModel(descriptor.value));
  }
  return { models };
}
function controlData(reply: Record<string, unknown>): Record<string, unknown> {
  const data = reply.data;
  if (
    reply.success !== true ||
    typeof data !== "object" ||
    data === null ||
    Array.isArray(data)
  )
    throw new Error("INVALID_MODEL_CATALOG");
  return data as Record<string, unknown>;
}
function projectModel(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("INVALID_MODEL_CATALOG");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new Error("INVALID_MODEL_CATALOG");
  const source = value as Record<string, unknown>;
  const provider = Object.getOwnPropertyDescriptor(source, "provider");
  const id = Object.getOwnPropertyDescriptor(source, "id");
  const name = Object.getOwnPropertyDescriptor(source, "name");
  if (
    !provider ||
    !("value" in provider) ||
    typeof provider.value !== "string" ||
    !id ||
    !("value" in id) ||
    typeof id.value !== "string" ||
    (name && (!("value" in name) || typeof name.value !== "string"))
  )
    throw new Error("INVALID_MODEL_CATALOG");
  return {
    provider: provider.value,
    id: id.value,
    name: name ? (name.value as string) : id.value,
  };
}
