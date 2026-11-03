import type { CommandCatalog } from "../interfaces/runtime-ports.js";

export function projectCommands(
  value: Record<string, unknown>,
): CommandCatalog {
  if (!Array.isArray(value.commands)) throw new Error("Query unavailable");
  return {
    commands: value.commands.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item))
        throw new Error("Query unavailable");
      const command = item as Record<string, unknown>;
      if (
        typeof command.name !== "string" ||
        typeof command.description !== "string"
      )
        throw new Error("Query unavailable");
      return { name: command.name, description: command.description };
    }),
  };
}
