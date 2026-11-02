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
describe("durable model catalog generations", () => {
  it("fences a replaced source generation on the same execution", async () => {
    let release!: (value: { models: [] }) => void;
    const readModelCatalog = vi.fn(
      () =>
        new Promise<{ models: [] }>((resolve) => {
          release = resolve;
        }),
    );
    const { manager } = setup({
      adapter: catalogAdapter,
      modelCatalog: { readModelCatalog },
    });
    const session = await manager.create({ cwd: process.cwd() });
    const query = manager.readModelCatalog(session.id);
    const state = internals(manager).context;
    state.inputState.trackExecution(session.id, state.owned.get(session.id)!);
    release({ models: [] });
    await expect(query).rejects.toMatchObject({ code: "SESSION_UNAVAILABLE" });
    expect(readModelCatalog).toHaveBeenCalledOnce();
  });
  it("fences owner changes after the adapter reply", async () => {
    let release!: (value: { models: [] }) => void;
    const { manager, store } = setup({
      adapter: catalogAdapter,
      modelCatalog: {
        readModelCatalog: () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      },
    });
    const session = await manager.create({ cwd: process.cwd() });
    const query = manager.readModelCatalog(session.id);
    store.stale = true;
    release({ models: [] });
    await expect(query).rejects.toMatchObject({ code: "STALE_OWNER" });
  });
});
