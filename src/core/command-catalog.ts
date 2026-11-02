export interface CommandDescriptor {
  name: string;
  description: string;
}

export interface CommandCatalog {
  commands: CommandDescriptor[];
}

export interface CommandCatalogExecutionPort {
  readCommandCatalog(): Promise<unknown>;
}

function invalid(): never {
  throw new Error("INVALID_COMMAND_CATALOG");
}

export function snapshotCommandCatalog(value: unknown): CommandCatalog {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return invalid();
  const keys = Reflect.ownKeys(value);
  if (keys.length !== 1 || keys[0] !== "commands") return invalid();
  const commandsDescriptor = Object.getOwnPropertyDescriptor(value, "commands");
  if (!commandsDescriptor || !("value" in commandsDescriptor)) return invalid();
  const commands = commandsDescriptor.value;
  if (!Array.isArray(commands)) return invalid();
  const arrayKeys = Reflect.ownKeys(commands);
  if (arrayKeys.length !== commands.length + 1 || !arrayKeys.includes("length"))
    return invalid();
  const result: CommandDescriptor[] = [];
  for (let index = 0; index < commands.length; index += 1) {
    const item = Object.getOwnPropertyDescriptor(commands, String(index));
    if (!item || !("value" in item)) return invalid();
    const descriptor = item.value;
    if (
      typeof descriptor !== "object" ||
      descriptor === null ||
      Array.isArray(descriptor)
    )
      return invalid();
    const recordPrototype = Object.getPrototypeOf(descriptor);
    if (recordPrototype !== Object.prototype && recordPrototype !== null)
      return invalid();
    const fields = Reflect.ownKeys(descriptor);
    if (
      fields.length !== 2 ||
      !fields.includes("name") ||
      !fields.includes("description")
    )
      return invalid();
    const name = Object.getOwnPropertyDescriptor(descriptor, "name");
    const description = Object.getOwnPropertyDescriptor(
      descriptor,
      "description",
    );
    if (
      !name ||
      !("value" in name) ||
      typeof name.value !== "string" ||
      !description ||
      !("value" in description) ||
      typeof description.value !== "string"
    )
      return invalid();
    result.push({ name: name.value, description: description.value });
  }
  return { commands: result };
}
