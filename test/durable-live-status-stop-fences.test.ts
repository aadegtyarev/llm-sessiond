import { describe, expect, it, vi } from "vitest";
import { setup } from "./durable-manager-support.js";
import { statusAdapter } from "./durable-live-status-support.js";

describe("live status stop and shutdown fences", () => {
  it("fences stop intent before stop confirmation and rejects its in-flight reply", async () => {
    let releaseRead!: (value: { effort: string }) => void;
    let releaseStop!: () => void;
    let stopping!: () => void;
    const stopEntered = new Promise<void>((resolve) => {
      stopping = resolve;
    });
    const readLiveStatus = vi.fn(
      () =>
        new Promise<{ effort: string }>((resolve) => {
          releaseRead = resolve;
        }),
    );
    const { manager } = setup({
      adapter: statusAdapter,
      liveStatus: { readLiveStatus },
      stop: async () => {
        stopping();
        await new Promise<void>((resolve) => {
          releaseStop = resolve;
        });
      },
      timeout: 5000,
    });
    const session = await manager.create({ cwd: process.cwd() });
    const query = manager.readLiveStatus(session.id);
    const stopped = manager.stop(session.id);
    await stopEntered;
    await expect(manager.readLiveStatus(session.id)).rejects.toMatchObject({
      code: "SESSION_UNAVAILABLE",
    });
    releaseRead({ effort: "old" });
    await expect(query).rejects.toMatchObject({ code: "SESSION_UNAVAILABLE" });
    releaseStop();
    await stopped;
    expect(readLiveStatus).toHaveBeenCalledOnce();
  });
  it("fences shutdown while physical stop is pending", async () => {
    let releaseStop!: () => void;
    let stopping!: () => void;
    const stopEntered = new Promise<void>((resolve) => {
      stopping = resolve;
    });
    const readLiveStatus = vi.fn(async () => ({ effort: "high" }));
    const { manager } = setup({
      adapter: statusAdapter,
      liveStatus: { readLiveStatus },
      stop: async () => {
        stopping();
        await new Promise<void>((resolve) => {
          releaseStop = resolve;
        });
      },
      timeout: 5000,
    });
    const session = await manager.create({ cwd: process.cwd() });
    const shuttingDown = manager.shutdownOwned();
    await stopEntered;
    await expect(manager.readLiveStatus(session.id)).rejects.toMatchObject({
      code: "SESSION_UNAVAILABLE",
    });
    releaseStop();
    await shuttingDown;
    expect(readLiveStatus).not.toHaveBeenCalled();
  });
});
