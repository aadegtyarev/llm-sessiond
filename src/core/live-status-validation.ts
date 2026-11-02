import { ControlPlaneError } from "./control-plane-error.js";
import type { LiveStatus, LiveUsage } from "./live-status.js";

function invalid(): never {
  throw new ControlPlaneError("OPERATION_FAILED");
}
function validCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function snapshotRecord(
  value: unknown,
  allowed: string[],
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return invalid();
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string" || !allowed.includes(key)))
    return invalid();
  const snapshot: Record<string, unknown> = {};
  for (const key of keys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) return invalid();
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}
export function validateLiveStatus(value: unknown): LiveStatus {
  const source = snapshotRecord(value, ["model", "effort", "usage"]);
  const result: Record<string, unknown> = {};
  if (Object.hasOwn(source, "effort")) {
    if (typeof source.effort !== "string") return invalid();
    result.effort = source.effort;
  }
  if (Object.hasOwn(source, "model")) {
    const model = snapshotRecord(source.model, ["provider", "id", "name"]);
    if (
      typeof model.provider !== "string" ||
      typeof model.id !== "string" ||
      typeof model.name !== "string"
    )
      return invalid();
    result.model = {
      provider: model.provider,
      id: model.id,
      name: model.name,
    };
  }
  if (Object.hasOwn(source, "usage"))
    result.usage = snapshotUsage(source.usage);
  return result as LiveStatus;
}
function snapshotUsage(value: unknown): LiveUsage {
  const keys = [
    "totalTokens",
    "inputTokens",
    "outputTokens",
    "cacheReadTokens",
    "cacheWriteTokens",
    "costUsd",
    "contextTokens",
    "contextWindow",
    "contextPercent",
  ];
  const source = snapshotRecord(value, keys);
  const result: Record<string, number | null> = {};
  for (const key of keys) {
    if (!Object.hasOwn(source, key)) continue;
    const count = source[key];
    const nullable = key === "contextTokens" || key === "contextPercent";
    if (count === null && nullable) result[key] = null;
    else if (validCount(count)) result[key] = count;
    else return invalid();
  }
  return result as LiveUsage;
}
