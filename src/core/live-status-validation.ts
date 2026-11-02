import { ControlPlaneError } from "./control-plane-error.js";
import type { LiveStatus, LiveUsage } from "./live-status.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function exactKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}
export function validateLiveStatus(value: unknown): LiveStatus {
  const invalid = (): never => {
    throw new ControlPlaneError("OPERATION_FAILED");
  };
  if (!isObject(value) || !exactKeys(value, ["model", "effort", "usage"]))
    return invalid();
  if (value.effort !== undefined && typeof value.effort !== "string")
    return invalid();
  if (value.model !== undefined) {
    const model = value.model;
    if (
      !isObject(model) ||
      !exactKeys(model, ["provider", "id", "name"]) ||
      typeof model.provider !== "string" ||
      typeof model.id !== "string" ||
      typeof model.name !== "string"
    )
      return invalid();
  }
  if (value.usage !== undefined) validateUsage(value.usage, invalid);
  return value as LiveStatus;
}
function validateUsage(
  value: unknown,
  invalid: () => never,
): asserts value is LiveUsage {
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
  if (!isObject(value) || !exactKeys(value, keys)) return invalid();
  for (const [key, count] of Object.entries(value)) {
    if (count === null && ["contextTokens", "contextPercent"].includes(key))
      continue;
    if (!validCount(count)) return invalid();
  }
}
