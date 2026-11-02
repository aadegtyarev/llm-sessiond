import type { LiveStatus, LiveUsage } from "../core/live-status.js";

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}
function model(value: unknown): LiveStatus["model"] {
  const native = record(value);
  if (
    !native ||
    typeof native.provider !== "string" ||
    typeof native.id !== "string"
  )
    throw new Error("INVALID_LIVE_STATUS");
  return {
    provider: native.provider,
    id: native.id,
    name: typeof native.name === "string" ? native.name : native.id,
  };
}
function usage(value: unknown): LiveUsage | undefined {
  const stats = record(value);
  if (!stats) throw new Error("INVALID_LIVE_STATUS");
  const tokens = record(stats.tokens);
  const context = record(stats.contextUsage);
  if (
    (stats.tokens !== undefined && !tokens) ||
    (stats.contextUsage !== undefined && !context)
  )
    throw new Error("INVALID_LIVE_STATUS");
  const result: LiveUsage = {};
  const fields: Array<[keyof LiveUsage, unknown]> = [
    ["totalTokens", tokens?.total],
    ["inputTokens", tokens?.input],
    ["outputTokens", tokens?.output],
    ["cacheReadTokens", tokens?.cacheRead],
    ["cacheWriteTokens", tokens?.cacheWrite],
    ["costUsd", stats.cost],
    ["contextWindow", context?.contextWindow],
  ];
  for (const [key, value] of fields) {
    if (value === undefined) continue;
    const parsed = count(value);
    if (parsed === undefined) throw new Error("INVALID_LIVE_STATUS");
    result[key] = parsed;
  }
  if (context && "tokens" in context) {
    if (context.tokens !== null && count(context.tokens) === undefined)
      throw new Error("INVALID_LIVE_STATUS");
    result.contextTokens = context.tokens as number | null;
  }
  if (context && "percent" in context) {
    if (context.percent !== null && count(context.percent) === undefined)
      throw new Error("INVALID_LIVE_STATUS");
    result.contextPercent = context.percent as number | null;
  }
  return Object.keys(result).length ? result : undefined;
}
export function projectPiLiveStatus(
  stateValue: unknown,
  statsValue: unknown,
): LiveStatus {
  const state = record(stateValue);
  if (!state) throw new Error("INVALID_LIVE_STATUS");
  const modelValue = state.model === undefined ? undefined : model(state.model);
  if (
    state.thinkingLevel !== undefined &&
    typeof state.thinkingLevel !== "string"
  )
    throw new Error("INVALID_LIVE_STATUS");
  const usageValue = usage(statsValue);
  return {
    ...(modelValue ? { model: modelValue } : {}),
    ...(typeof state.thinkingLevel === "string"
      ? { effort: state.thinkingLevel }
      : {}),
    ...(usageValue ? { usage: usageValue } : {}),
  };
}
