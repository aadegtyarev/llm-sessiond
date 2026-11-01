import { describe, expect, it } from "vitest";
import { checkpoint, setup } from "./durable-manager-support.js";
describe("resume success-transition cleanup", () => {
  it("cleans execution when identity or running-state persistence fails", async () => {
    for (const failure of ["identity", "status"] as const) {
      let live = false;
      const { manager, store } = setup({
        launch: async () => {
          live = true;
          return { checkpoint: checkpoint(1) };
        },
        resume: async () => {
          live = true;
          return { checkpoint: checkpoint(2) };
        },
        stop: async () => {
          live = false;
        },
      });
      const row = await manager.create({ cwd: process.cwd() });
      await manager.stop(row.id);
      if (failure === "identity") store.failExecutionUpdate = true;
      else store.failRunningStatus = true;
      await expect(manager.resume(row.id)).rejects.toMatchObject({
        code: "OPERATION_FAILED",
      });
      expect(live).toBe(false);
      expect(store.get(row.id)?.status).toBe("failed");
    }
  });
  it("cleans stale-owner resumed execution without rewriting its starting row", async () => {
    let live = false;
    let stale = () => {};
    const { manager, store } = setup({
      launch: async () => ({ checkpoint: checkpoint(1) }),
      resume: async () => {
        live = true;
        stale();
        return { checkpoint: checkpoint(2) };
      },
      stop: async () => {
        live = false;
      },
    });
    const row = await manager.create({ cwd: process.cwd() });
    await manager.stop(row.id);
    stale = () => {
      store.stale = true;
    };
    await expect(manager.resume(row.id)).rejects.toMatchObject({
      code: "OPERATION_FAILED",
    });
    expect(live).toBe(false);
    expect(store.get(row.id)?.status).toBe("starting");
  });
});
