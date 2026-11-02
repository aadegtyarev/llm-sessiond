import type { CommandCatalog } from "../core/command-catalog.js";
import type { PiDurableRpcLink } from "./pi-durable-rpc-link.js";

export async function readPiCommandCatalog(
  link: PiDurableRpcLink,
  isCurrent: () => boolean,
): Promise<CommandCatalog> {
  if (!link.writable || !isCurrent()) throw new Error("RPC_UNAVAILABLE");
  const reply = await link.command("get_commands", {});
  if (!link.writable || !isCurrent()) throw new Error("RPC_UNAVAILABLE");
  const data = field(reply, "data");
  if (field(reply, "success") !== true || !record(data))
    throw new Error("INVALID_COMMAND_CATALOG");
  const commands = field(data, "commands");
  if (!Array.isArray(commands)) throw new Error("INVALID_COMMAND_CATALOG");
  const keys = Reflect.ownKeys(commands);
  if (keys.length !== commands.length + 1 || !keys.includes("length"))
    throw new Error("INVALID_COMMAND_CATALOG");
  const result: CommandCatalog["commands"] = [];
  for (let index = 0; index < commands.length; index += 1) {
    const item = Object.getOwnPropertyDescriptor(commands, String(index));
    if (!item || !("value" in item)) throw new Error("INVALID_COMMAND_CATALOG");
    const command = item.value;
    if (!record(command)) continue;
    const source = field(command, "source");
    const name = field(command, "name");
    if (
      source !== "extension" ||
      typeof name !== "string" ||
      !/^[a-z][a-z0-9_-]{0,31}$/.test(name) ||
      name === "reload"
    )
      continue;
    const description = Object.getOwnPropertyDescriptor(command, "description");
    if (
      description &&
      (!("value" in description) || typeof description.value !== "string")
    )
      throw new Error("INVALID_COMMAND_CATALOG");
    result.push({
      name,
      description: description ? (description.value as string) : "",
    });
  }
  return { commands: result };
}

function record(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function field(record: Record<string, unknown>, name: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, name);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}
