import { describe, expect, it } from "vitest";
import { setup } from "./durable-manager-support.js";
import { internals, statusAdapter } from "./durable-live-status-support.js";

describe("overlapping lifecycle intents", () => {
  it("removes only its own stop token after preflight rejection", async () => {
    let release!: () => void;
    let stopEntered!: () => void;
    const entered = new Promise<void>((resolve) => {
      stopEntered = resolve;
    });
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
      liveStatus: { readLiveStatus: async () => ({}) },
      stop: async () => {
        stopEntered();
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      },
      timeout: 5000,
    });
    const session = await manager.create({ cwd: process.cwd() });
    let unlock!: () => void;
    const locked = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const locks = internals(manager).locks;
    const lock = locks.run(session.id, async () => locked);
    const stop = manager.stop(session.id);
    const shutdown = manager.shutdownOwned();
    unlock();
    await lock;
    await expect(stop).rejects.toMatchObject({
      code: "UNSUPPORTED_CAPABILITY",
    });
    await entered;
    expect(
      internals(manager).context.lifecycleIntents.get(session.id)?.size,
    ).toBe(1);
    await expect(manager.readLiveStatus(session.id)).rejects.toMatchObject({
      code: "SESSION_UNAVAILABLE",
    });
    release();
    await shutdown;
    expect(internals(manager).context.lifecycleIntents.has(session.id)).toBe(
      false,
    );
  });
});
