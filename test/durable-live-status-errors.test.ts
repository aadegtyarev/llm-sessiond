import { describe, expect, it } from "vitest";
import type { LifecycleExecution } from "../src/core/lifecycle-execution.js";
import { setup } from "./durable-manager-support.js";
import { statusAdapter } from "./durable-live-status-support.js";

describe("live status safe adapter boundary", () => {
  it("maps synchronous throws and promise rejections without retaining raw errors", async () => {
    for (const readLiveStatus of [
      () => {
        throw new Error("sync secret");
      },
      async () => {
        throw new Error("async secret");
      },
    ]) {
      const { manager } = setup({
        adapter: statusAdapter,
        liveStatus: { readLiveStatus },
      });
      const session = await manager.create({ cwd: process.cwd() });
      await expect(manager.readLiveStatus(session.id)).rejects.toMatchObject({
        code: "OPERATION_FAILED",
        message: "lifecycle operation failed",
      });
    }
  });
  it("maps a throwing optional-port accessor safely", async () => {
    const factory = (): LifecycleExecution => ({
      get liveStatus(): LifecycleExecution["liveStatus"] {
        throw new Error("getter secret");
      },
      launch: async () => ({}),
      resume: async () => ({}),
      stop: async () => {},
    });
    const { manager } = setup({ adapter: statusAdapter, factory });
    const session = await manager.create({ cwd: process.cwd() });
    await expect(manager.readLiveStatus(session.id)).rejects.toMatchObject({
      code: "OPERATION_FAILED",
      message: "lifecycle operation failed",
    });
  });
});
