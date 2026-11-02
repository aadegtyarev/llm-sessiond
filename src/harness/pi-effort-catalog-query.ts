import type { EffortCatalog } from "../core/effort-catalog.js";
import type { PiDurableRpcLink } from "./pi-durable-rpc-link.js";

export async function readPiEffortCatalog(
  link: PiDurableRpcLink,
  isCurrent: () => boolean,
  timeoutMs: () => number = () => 15_000,
): Promise<EffortCatalog> {
  if (!link.writable || !isCurrent()) throw new Error("RPC_UNAVAILABLE");
  const reply = await link.command(
    "get_available_thinking_levels",
    {},
    timeoutMs(),
    () => isCurrent(),
  );
  if (!link.writable || !isCurrent()) throw new Error("RPC_UNAVAILABLE");
  const success = Object.getOwnPropertyDescriptor(reply, "success");
  const responseData = Object.getOwnPropertyDescriptor(reply, "data");
  if (
    !success ||
    !("value" in success) ||
    success.value !== true ||
    !responseData ||
    !("value" in responseData)
  )
    throw new Error("INVALID_EFFORT_CATALOG");
  const data = responseData.value;
  if (typeof data !== "object" || data === null || Array.isArray(data))
    throw new Error("INVALID_EFFORT_CATALOG");
  const prototype = Object.getPrototypeOf(data);
  if (prototype !== Object.prototype && prototype !== null)
    throw new Error("INVALID_EFFORT_CATALOG");
  const descriptor = Object.getOwnPropertyDescriptor(data, "levels");
  if (
    !descriptor ||
    !("value" in descriptor) ||
    !Array.isArray(descriptor.value)
  )
    throw new Error("INVALID_EFFORT_CATALOG");
  const nativeLevels: unknown[] = descriptor.value;
  const keys = Reflect.ownKeys(nativeLevels);
  if (keys.length !== nativeLevels.length + 1 || !keys.includes("length"))
    throw new Error("INVALID_EFFORT_CATALOG");
  const levels: string[] = [];
  for (let index = 0; index < nativeLevels.length; index += 1) {
    const item = Object.getOwnPropertyDescriptor(nativeLevels, String(index));
    if (!item || !("value" in item) || typeof item.value !== "string")
      throw new Error("INVALID_EFFORT_CATALOG");
    levels.push(item.value);
  }
  return { levels };
}
