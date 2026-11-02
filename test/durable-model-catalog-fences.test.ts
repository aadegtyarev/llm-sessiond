import { describe, expect, it, vi } from "vitest";
import { setup, synthetic } from "./durable-manager-support.js";
import { internals } from "./durable-live-status-support.js";

const catalogAdapter = {
  ...synthetic,
  descriptor: {
    ...synthetic.descriptor,
    capabilities: [...synthetic.descriptor.capabilities, "models.read"],
  },
};

describe("durable model catalog lifecycle fences", () => {
  it("fences a resolved read when stop starts before continuation", async () => {
    let release!: (value: {
      models: Array<{ provider: string; id: string; name: string }>;
    }) => void;
    const readModelCatalog = vi.fn(
      () =>
        new Promise<{
          models: Array<{ provider: string; id: string; name: string }>;
        }>((resolve) => {
          release = resolve;
        }),
    );
    const { manager } = setup({
      adapter: catalogAdapter,
      modelCatalog: { readModelCatalog },
    });
    const session = await manager.create({ cwd: process.cwd() });
    const query = manager.readModelCatalog(session.id);
    await vi.waitFor(() => expect(readModelCatalog).toHaveBeenCalledOnce());
    const stopping = manager.stop(session.id);
    release({ models: [] });
    await expect(query).rejects.toMatchObject({ code: "SESSION_UNAVAILABLE" });
    await stopping;
  });
  it("rechecks a stop intent raised by the captured port getter", async () => {
    const readModelCatalog = vi.fn(async () => ({ models: [] }));
    const { manager } = setup({
      adapter: catalogAdapter,
      modelCatalog: { readModelCatalog },
    });
    const session = await manager.create({ cwd: process.cwd() });
    const execution = internals(manager).context.owned.get(session.id)!;
    let stopping: Promise<unknown> | undefined;
    Object.defineProperty(execution, "modelCatalog", {
      get() {
        stopping = manager.stop(session.id);
        return { readModelCatalog };
      },
    });
    await expect(manager.readModelCatalog(session.id)).rejects.toMatchObject({
      code: "SESSION_UNAVAILABLE",
    });
    await stopping;
    expect(readModelCatalog).not.toHaveBeenCalled();
  });
});
