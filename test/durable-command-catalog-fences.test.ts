import { describe, expect, it, vi } from "vitest";
import { setup, synthetic } from "./durable-manager-support.js";
import { internals } from "./durable-live-status-support.js";

const adapter = {
  ...synthetic,
  descriptor: {
    ...synthetic.descriptor,
    capabilities: [...synthetic.descriptor.capabilities, "commands.read"],
  },
};

describe("durable command catalog lifecycle fences", () => {
  it("fences a resolved query when stop starts before its continuation", async () => {
    let release!: (value: { commands: never[] }) => void;
    const readCommandCatalog = vi.fn(
      () =>
        new Promise<{ commands: never[] }>((resolve) => {
          release = resolve;
        }),
    );
    const { manager } = setup({
      adapter,
      commandCatalog: { readCommandCatalog },
    });
    const session = await manager.create({ cwd: process.cwd() });
    const query = manager.readCommandCatalog(session.id);
    await vi.waitFor(() => expect(readCommandCatalog).toHaveBeenCalledOnce());
    const stopping = manager.stop(session.id);
    release({ commands: [] });
    await expect(query).rejects.toMatchObject({ code: "SESSION_UNAVAILABLE" });
    await stopping;
  });

  it("rechecks stop intent raised by a captured port getter", async () => {
    const readCommandCatalog = vi.fn(async () => ({ commands: [] }));
    const { manager } = setup({
      adapter,
      commandCatalog: { readCommandCatalog },
    });
    const session = await manager.create({ cwd: process.cwd() });
    const execution = internals(manager).context.owned.get(session.id)!;
    let stopping: Promise<unknown> | undefined;
    Object.defineProperty(execution, "commandCatalog", {
      get() {
        stopping = manager.stop(session.id);
        return { readCommandCatalog };
      },
    });
    await expect(manager.readCommandCatalog(session.id)).rejects.toMatchObject({
      code: "SESSION_UNAVAILABLE",
    });
    await stopping;
    expect(readCommandCatalog).not.toHaveBeenCalled();
  });
});
