import { describe, expect, it, vi } from "vitest";
import { ControlPlaneError } from "../src/core/control-plane-error.js";
import { setup } from "./durable-manager-support.js";
import { statusAdapter } from "./durable-live-status-support.js";

describe("durable live status routing", () => {
  it("uses an optional port for any registered running execution", async () => {
    const adapter = statusAdapter;
    const readLiveStatus = vi.fn(async () => ({
      model: { provider: "p", id: "m", name: "Model" },
      usage: { totalTokens: 0 },
    }));
    const { manager } = setup({ adapter, liveStatus: { readLiveStatus } });
    const session = await manager.create({ cwd: process.cwd() });
    await expect(manager.readLiveStatus(session.id)).resolves.toEqual({
      model: { provider: "p", id: "m", name: "Model" },
      usage: { totalTokens: 0 },
    });
    expect(readLiveStatus).toHaveBeenCalledOnce();
  });
  it("rejects unsupported and stopped sessions before querying", async () => {
    const readLiveStatus = vi.fn(async () => ({}));
    const { manager } = setup({ liveStatus: { readLiveStatus } });
    const session = await manager.create({ cwd: process.cwd() });
    await expect(manager.readLiveStatus(session.id)).rejects.toMatchObject({
      code: "UNSUPPORTED_CAPABILITY",
    });
    await manager.stop(session.id);
    await expect(manager.readLiveStatus(session.id)).rejects.toThrow(
      ControlPlaneError,
    );
    expect(readLiveStatus).not.toHaveBeenCalled();
  });
  it("does not expose a reply after stop starts", async () => {
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
    await vi.waitFor(() => expect(readLiveStatus).toHaveBeenCalledOnce());
    await manager.stop(session.id);
    release({ effort: "high" });
    await expect(query).rejects.toMatchObject({ code: "SESSION_UNAVAILABLE" });
  });
  it("rejects extra DTO fields", async () => {
    const { manager } = setup({
      adapter: statusAdapter,
      liveStatus: {
        readLiveStatus: async () => ({ secret: "hidden" }) as never,
      },
    });
    const session = await manager.create({ cwd: process.cwd() });
    await expect(manager.readLiveStatus(session.id)).rejects.toMatchObject({
      code: "OPERATION_FAILED",
    });
  });
});
