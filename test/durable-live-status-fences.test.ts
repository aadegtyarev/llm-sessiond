import { describe, expect, it, vi } from "vitest";
import { setup } from "./durable-manager-support.js";
import { internals, statusAdapter } from "./durable-live-status-support.js";

describe("live status lifecycle fences", () => {
  it("fences a replaced source generation on the same execution", async () => {
    let release!: (value: { effort: string }) => void;
    const readLiveStatus = vi.fn(
      () =>
        new Promise<{ effort: string }>((resolve) => {
          release = resolve;
        }),
    );
    const { manager } = setup({
      adapter: statusAdapter,
      liveStatus: { readLiveStatus },
    });
    const session = await manager.create({ cwd: process.cwd() });
    const query = manager.readLiveStatus(session.id);
    const state = internals(manager).context;
    const execution = state.owned.get(session.id)!;
    state.inputState.trackExecution(session.id, execution);
    release({ effort: "old" });
    await expect(query).rejects.toMatchObject({ code: "SESSION_UNAVAILABLE" });
    expect(readLiveStatus).toHaveBeenCalledOnce();
  });
  it("fences a terminal event from the tracked input source", async () => {
    let release!: (value: { effort: string }) => void;
    let emit!: (event: unknown) => void;
    const { manager } = setup({
      adapter: statusAdapter,
      inputs: {
        submit: async () => ({ kind: "accepted" }),
        cancel: async () => ({ kind: "accepted" }),
        subscribe: (listener) => {
          emit = listener;
          return () => {};
        },
      },
      liveStatus: {
        readLiveStatus: () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      },
    });
    const session = await manager.create({ cwd: process.cwd() });
    const query = manager.readLiveStatus(session.id);
    emit({ kind: "execution-ended" });
    release({ effort: "high" });
    await expect(query).rejects.toMatchObject({ code: "SESSION_UNAVAILABLE" });
  });
  it("fences owner changes after the adapter reply", async () => {
    let release!: (value: { effort: string }) => void;
    const { manager, store } = setup({
      adapter: statusAdapter,
      liveStatus: {
        readLiveStatus: () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      },
    });
    const session = await manager.create({ cwd: process.cwd() });
    const query = manager.readLiveStatus(session.id);
    store.stale = true;
    release({ effort: "high" });
    await expect(query).rejects.toMatchObject({ code: "STALE_OWNER" });
  });
});
