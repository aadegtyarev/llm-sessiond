import type { PiProcess } from "./pi-process.js";
import type {
  CommandCatalog,
  EffortCatalog,
  ModelCatalog,
} from "../interfaces/runtime-ports.js";
import { queryPiData as query } from "./pi-query-support.js";
export async function readPiModels(process: PiProcess): Promise<ModelCatalog> {
  const data = await query(process, "get_available_models");
  if (!Array.isArray(data.models)) throw new Error("Query unavailable");
  return {
    models: data.models.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item))
        throw new Error("Query unavailable");
      const model = item as Record<string, unknown>;
      if (
        typeof model.provider !== "string" ||
        typeof model.id !== "string" ||
        (model.name !== undefined && typeof model.name !== "string")
      )
        throw new Error("Query unavailable");
      return {
        provider: model.provider,
        id: model.id,
        name: typeof model.name === "string" ? model.name : model.id,
      };
    }),
  };
}
export async function readPiEfforts(
  process: PiProcess,
): Promise<EffortCatalog> {
  const data = await query(process, "get_available_thinking_levels");
  if (
    !Array.isArray(data.levels) ||
    data.levels.some((item) => typeof item !== "string")
  )
    throw new Error("Query unavailable");
  return { levels: [...data.levels] as string[] };
}
export async function readPiCommands(
  process: PiProcess,
): Promise<CommandCatalog> {
  const data = await query(process, "get_commands");
  if (!Array.isArray(data.commands)) throw new Error("Query unavailable");
  const commands = data.commands.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const command = item as Record<string, unknown>;
    if (
      command.source !== "extension" ||
      typeof command.name !== "string" ||
      !/^[a-z][a-z0-9_-]{0,31}$/.test(command.name) ||
      command.name === "reload"
    )
      return [];
    if (
      command.description !== undefined &&
      typeof command.description !== "string"
    )
      throw new Error("Query unavailable");
    return [
      {
        name: command.name,
        description:
          typeof command.description === "string" ? command.description : "",
      },
    ];
  });
  return { commands };
}
