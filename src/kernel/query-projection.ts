import type {
  EffortCatalog,
  LiveStatus,
  ModelCatalog,
} from "../interfaces/runtime-ports.js";

export function projectModels(value: Record<string, unknown>): ModelCatalog {
  if (!Array.isArray(value.models)) throw new Error("Query unavailable");
  const models = value.models.map((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.provider !== "string" ||
      typeof entry.id !== "string" ||
      typeof entry.name !== "string"
    )
      throw new Error("Query unavailable");
    return { provider: entry.provider, id: entry.id, name: entry.name };
  });
  return { models };
}

export function projectEfforts(value: Record<string, unknown>): EffortCatalog {
  if (
    !Array.isArray(value.levels) ||
    value.levels.some((level) => typeof level !== "string")
  )
    throw new Error("Query unavailable");
  if (value.current !== undefined && typeof value.current !== "string")
    throw new Error("Query unavailable");
  return {
    levels: [...value.levels] as string[],
    ...(value.current === undefined
      ? {}
      : { current: value.current as string }),
  };
}

export function projectStatus(value: Record<string, unknown>): LiveStatus {
  const result: LiveStatus = {};
  if (value.model !== undefined) {
    if (
      !isRecord(value.model) ||
      typeof value.model.provider !== "string" ||
      typeof value.model.id !== "string" ||
      typeof value.model.name !== "string"
    )
      throw new Error("Query unavailable");
    result.model = {
      provider: value.model.provider,
      id: value.model.id,
      name: value.model.name,
    };
  }
  if (value.effort !== undefined) {
    if (typeof value.effort !== "string") throw new Error("Query unavailable");
    result.effort = value.effort;
  }
  if (value.usage !== undefined) {
    if (!isRecord(value.usage)) throw new Error("Query unavailable");
    const usage: Record<string, number | null> = {};
    const allowed = new Set([
      "totalTokens",
      "inputTokens",
      "outputTokens",
      "cacheReadTokens",
      "cacheWriteTokens",
      "costUsd",
      "contextTokens",
      "contextWindow",
      "contextPercent",
    ]);
    for (const [key, entry] of Object.entries(value.usage)) {
      const nullable = key === "contextTokens" || key === "contextPercent";
      if (
        !allowed.has(key) ||
        (entry === null && !nullable) ||
        (typeof entry !== "number" && entry !== null) ||
        (typeof entry === "number" && (!Number.isFinite(entry) || entry < 0))
      )
        throw new Error("Query unavailable");
      usage[key] = entry as number | null;
    }
    result.usage = usage;
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
