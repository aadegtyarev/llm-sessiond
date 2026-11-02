import { describe, expect, it, vi } from "vitest";
import { setup, synthetic } from "./durable-manager-support.js";
import { internals } from "./durable-live-status-support.js";

const adapter = {
  ...synthetic,
  descriptor: {
    ...synthetic.descriptor,
    capabilities: [...synthetic.descriptor.capabilities, "effort.read"],
  },
};

describe("durable effort catalog lifecycle fences", () => {
  it("fences a resolved query when stop begins before continuation", async () => {
    let release!: (value: { levels: [] }) => void;
    const readEffortCatalog = vi.fn(
      () =>
        new Promise<{ levels: [] }>((resolve) => {
          release = resolve;
        }),
    );
    const { manager } = setup({
      adapter,
      effortCatalog: { readEffortCatalog },
    });
    const session = await manager.create({ cwd: process.cwd() });
    const query = manager.readEffortCatalog(session.id);
    await vi.waitFor(() => expect(readEffortCatalog).toHaveBeenCalledOnce());
    const stopping = manager.stop(session.id);
    release({ levels: [] });
    await expect(query).rejects.toMatchObject({ code: "SESSION_UNAVAILABLE" });
    await stopping;
  });
  it("fences ownership and source-generation replacement after the reply", async () => {
    let release!: (value: { levels: [] }) => void;
    const { manager } = setup({
      adapter,
      effortCatalog: {
        readEffortCatalog: () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      },
    });
    const session = await manager.create({ cwd: process.cwd() });
    const query = manager.readEffortCatalog(session.id);
    const context = internals(manager).context;
    await vi.waitFor(() => expect(context.owned.has(session.id)).toBe(true));
    context.inputState.trackExecution(
      session.id,
      context.owned.get(session.id)!,
    );
    release({ levels: [] });
    await expect(query).rejects.toMatchObject({ code: "SESSION_UNAVAILABLE" });

    let releaseOwner!: (value: { levels: [] }) => void;
    const next = setup({
      adapter,
      effortCatalog: {
        readEffortCatalog: () =>
          new Promise((resolve) => {
            releaseOwner = resolve;
          }),
      },
    });
    const active = await next.manager.create({ cwd: process.cwd() });
    const pending = next.manager.readEffortCatalog(active.id);
    next.store.stale = true;
    releaseOwner({ levels: [] });
    await expect(pending).rejects.toMatchObject({ code: "STALE_OWNER" });
  });
  it("rechecks stop intent after capturing a reentrant port getter", async () => {
    const readEffortCatalog = vi.fn(async () => ({ levels: [] }));
    const { manager } = setup({
      adapter,
      effortCatalog: { readEffortCatalog },
    });
    const session = await manager.create({ cwd: process.cwd() });
    const execution = internals(manager).context.owned.get(session.id)!;
    let stopping: Promise<unknown> | undefined;
    Object.defineProperty(execution, "effortCatalog", {
      get() {
        stopping = manager.stop(session.id);
        return { readEffortCatalog };
      },
    });
    await expect(manager.readEffortCatalog(session.id)).rejects.toMatchObject({
      code: "SESSION_UNAVAILABLE",
    });
    await stopping;
    expect(readEffortCatalog).not.toHaveBeenCalled();
  });
});
