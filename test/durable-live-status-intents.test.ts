import { describe, expect, it } from "vitest";
import { setup } from "./durable-manager-support.js";
import { internals, statusAdapter } from "./durable-live-status-support.js";

describe("synchronous live-status lifecycle intents", () => {
  it("fences stop and shutdown in the same turn before their locks run", async () => {
    for (const operation of ["stop", "shutdown"] as const) {
      const readLiveStatus = async () => ({ effort: "high" });
      const { manager } = setup({
        adapter: statusAdapter,
        liveStatus: { readLiveStatus },
      });
      const session = await manager.create({ cwd: process.cwd() });
      const requested =
        operation === "stop"
          ? manager.stop(session.id)
          : manager.shutdownOwned();
      await expect(manager.readLiveStatus(session.id)).rejects.toMatchObject({
        code: "SESSION_UNAVAILABLE",
      });
      await requested;
    }
  });
  it("clears a stop intent when capability preflight rejects", async () => {
    const adapter = {
      ...statusAdapter,
      descriptor: {
        ...statusAdapter.descriptor,
        capabilities: statusAdapter.descriptor.capabilities.filter(
          (capability) => capability !== "harness.stop",
        ),
      },
    };
    const { manager } = setup({
      adapter,
      liveStatus: { readLiveStatus: async () => ({ effort: "high" }) },
    });
    const session = await manager.create({ cwd: process.cwd() });
    await expect(manager.stop(session.id)).rejects.toMatchObject({
      code: "UNSUPPORTED_CAPABILITY",
    });
    await expect(manager.readLiveStatus(session.id)).resolves.toEqual({
      effort: "high",
    });
  });
  it("fences queued operations behind a busy lifecycle lock", async () => {
    for (const operation of ["stop", "shutdown"] as const) {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const { manager } = setup({
        adapter: statusAdapter,
        liveStatus: { readLiveStatus: async () => ({}) },
      });
      const session = await manager.create({ cwd: process.cwd() });
      const locks = internals(manager).locks;
      const lock = locks.run(session.id, async () => gate);
      const requested =
        operation === "stop"
          ? manager.stop(session.id)
          : manager.shutdownOwned();
      await expect(manager.readLiveStatus(session.id)).rejects.toMatchObject({
        code: "SESSION_UNAVAILABLE",
      });
      release();
      await lock;
      await requested;
    }
  });
});
