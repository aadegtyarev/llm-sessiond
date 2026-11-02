import { describe, expect, it, vi } from "vitest";
import { setup } from "./durable-manager-support.js";
import { internals, statusAdapter } from "./durable-live-status-support.js";

describe("live status execution lifecycle", () => {
  it("rejects missing rows, ports, and failed input subscriptions", async () => {
    const readLiveStatus = vi.fn(async () => ({ effort: "high" }));
    const missingPort = setup({ adapter: statusAdapter });
    const session = await missingPort.manager.create({ cwd: process.cwd() });
    await expect(
      missingPort.manager.readLiveStatus(session.id),
    ).rejects.toMatchObject({ code: "SESSION_UNAVAILABLE" });
    missingPort.store.delete(session.id);
    await expect(
      missingPort.manager.readLiveStatus(session.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const failed = setup({
      adapter: statusAdapter,
      liveStatus: { readLiveStatus },
      inputs: {
        submit: async () => ({ kind: "accepted" }),
        cancel: async () => ({ kind: "accepted" }),
        subscribe: () => {
          throw new Error("secret");
        },
      },
    });
    const failedSession = await failed.manager.create({ cwd: process.cwd() });
    await expect(
      failed.manager.readLiveStatus(failedSession.id),
    ).rejects.toMatchObject({ code: "SESSION_UNAVAILABLE" });
    expect(readLiveStatus).not.toHaveBeenCalled();
  });
  it("rejects pending finalization before calling the port", async () => {
    const readLiveStatus = vi.fn(async () => ({ effort: "high" }));
    const { manager } = setup({
      adapter: statusAdapter,
      liveStatus: { readLiveStatus },
    });
    const session = await manager.create({ cwd: process.cwd() });
    const state = internals(manager).context;
    state.pending.set(session.id, {
      status: "stopped",
      reason: null,
      at: null,
      execution: state.owned.get(session.id),
      stopRequired: true,
    });
    await expect(manager.readLiveStatus(session.id)).rejects.toMatchObject({
      code: "SESSION_UNAVAILABLE",
    });
    expect(readLiveStatus).not.toHaveBeenCalled();
  });
  it("rejects old replies after stop and a new execution resumes", async () => {
    let releaseOld!: (value: { effort: string }) => void;
    let call = 0;
    const readLiveStatus = vi.fn(() =>
      call++ === 0
        ? new Promise<{ effort: string }>((resolve) => {
            releaseOld = resolve;
          })
        : Promise.resolve({ effort: "new" }),
    );
    const { manager } = setup({
      adapter: statusAdapter,
      liveStatus: { readLiveStatus },
    });
    const session = await manager.create({ cwd: process.cwd() });
    const old = internals(manager).context.owned.get(session.id);
    const query = manager.readLiveStatus(session.id);
    await manager.stop(session.id);
    await manager.resume(session.id);
    expect(internals(manager).context.owned.get(session.id)).not.toBe(old);
    releaseOld({ effort: "old" });
    await expect(query).rejects.toMatchObject({ code: "SESSION_UNAVAILABLE" });
    await expect(manager.readLiveStatus(session.id)).resolves.toEqual({
      effort: "new",
    });
  });
});
