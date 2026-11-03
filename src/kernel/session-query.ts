import type {
  EffortCatalog,
  CommandCatalog,
  LiveStatus,
  ModelCatalog,
} from "../interfaces/runtime-ports.js";
import type { RuntimeState } from "./runtime-state.js";
import { projectCommands } from "./command-catalog-projection.js";
import {
  projectEfforts,
  projectModels,
  projectStatus,
} from "./query-projection.js";
import { current, port, read } from "./store-access.js";
import { sessionId } from "./session-records.js";

export function queryStatus(
  state: RuntimeState,
  id: string,
): Promise<LiveStatus> {
  return query(state, id, "status") as Promise<LiveStatus>;
}
export function queryModels(
  state: RuntimeState,
  id: string,
): Promise<ModelCatalog> {
  return query(state, id, "models") as Promise<ModelCatalog>;
}
export function queryEfforts(
  state: RuntimeState,
  id: string,
): Promise<EffortCatalog> {
  return query(state, id, "efforts") as Promise<EffortCatalog>;
}
export function queryCommands(
  state: RuntimeState,
  id: string,
): Promise<CommandCatalog> {
  return query(state, id, "commands") as Promise<CommandCatalog>;
}

async function query(
  state: RuntimeState,
  id: string,
  kind: "status" | "models" | "efforts" | "commands",
): Promise<LiveStatus | ModelCatalog | EffortCatalog | CommandCatalog> {
  if (!current(state)) throw new Error("Runtime unavailable");
  id = sessionId(id);
  const session = read(state, id);
  if (
    !session ||
    session.status !== "running" ||
    state.closing ||
    state.stopping.has(id)
  )
    throw new Error("Session unavailable");
  const target = port(state, session.harnessId);
  const required =
    kind === "status"
      ? ["status.read", "usage.read"]
      : [
          kind === "models"
            ? "models.read"
            : kind === "efforts"
              ? "effort.read"
              : "commands.read",
        ];
  if (
    required.some(
      (capability) => !target.descriptor.capabilities.includes(capability),
    )
  )
    throw new Error("Query unsupported");
  const operation = target.port[kind];
  if (!operation) throw new Error("Query unsupported");
  const epoch = state.sources.get(id);
  let data: unknown;
  try {
    data = JSON.parse(JSON.stringify(await operation(id)));
  } catch {
    throw new Error("Query unavailable");
  }
  if (
    !current(state) ||
    state.closing ||
    state.stopping.has(id) ||
    state.sources.get(id) !== epoch
  )
    throw new Error("Query unavailable");
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("Query unavailable");
  const value = data as Record<string, unknown>;
  return kind === "status"
    ? projectStatus(value)
    : kind === "models"
      ? projectModels(value)
      : kind === "efforts"
        ? projectEfforts(value)
        : projectCommands(value);
}
