import { describe, expect, it, vi } from "vitest";
import { setup, synthetic } from "./durable-manager-support.js";
import { snapshotCommandCatalog } from "../src/core/command-catalog.js";

const commandAdapter = {
  ...synthetic,
  descriptor: {
    ...synthetic.descriptor,
    capabilities: [...synthetic.descriptor.capabilities, "commands.read"],
  },
};

describe("durable command catalog routing", () => {
  it("preserves arbitrary standard names and returns a fresh strict snapshot", async () => {
    const commands = [{ name: "Third Party.Command", description: " exact " }];
    const readCommandCatalog = vi.fn(async () => ({ commands }));
    const { manager } = setup({
      adapter: commandAdapter,
      commandCatalog: { readCommandCatalog },
    });
    const session = await manager.create({ cwd: process.cwd() });
    const result = await manager.readCommandCatalog(session.id);
    expect(result).toEqual({ commands });
    expect(result.commands).not.toBe(commands);
    expect(result.commands[0]).not.toBe(commands[0]);
    commands[0]!.name = "mutated";
    expect(result.commands[0]!.name).toBe("Third Party.Command");
  });

  it("rejects accessor-backed fields without invoking them", () => {
    let invoked = false;
    const command = { name: "safe", description: "ok" };
    Object.defineProperty(command, "description", {
      get() {
        invoked = true;
        return "hidden";
      },
    });
    expect(() => snapshotCommandCatalog({ commands: [command] })).toThrow(
      "INVALID_COMMAND_CATALOG",
    );
    expect(invoked).toBe(false);
  });

  it("rejects missing ports and malformed or unknown DTO fields safely", async () => {
    const missing = setup({ adapter: commandAdapter });
    const session = await missing.manager.create({ cwd: process.cwd() });
    await expect(
      missing.manager.readCommandCatalog(session.id),
    ).rejects.toMatchObject({ code: "SESSION_UNAVAILABLE" });
    const readCommandCatalog = vi.fn(async () => ({
      commands: [{ name: "valid", description: "ok", source: "leak" }],
    }));
    const malformed = setup({
      adapter: commandAdapter,
      commandCatalog: { readCommandCatalog },
    });
    const active = await malformed.manager.create({ cwd: process.cwd() });
    await expect(
      malformed.manager.readCommandCatalog(active.id),
    ).rejects.toMatchObject({ code: "OPERATION_FAILED" });
    expect(readCommandCatalog).toHaveBeenCalledOnce();
  });
});
