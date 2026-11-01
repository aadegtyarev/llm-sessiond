import { describe, expect, it } from "vitest";
import { setup } from "./durable-manager-support.js";
describe("shutdown finalization persistence", () => {
  it("does not repeat confirmed stop when stopped write fails", async () => {
    let stops = 0;
    const { manager, store } = setup({
      stop: async () => {
        stops++;
      },
    });
    const row = await manager.create({ cwd: process.cwd() });
    store.failStatus = "stopped";
    await expect(manager.shutdownOwned()).rejects.toMatchObject({
      code: "STORE_FAILED",
    });
    expect(stops).toBe(1);
    await manager.shutdownOwned();
    expect(stops).toBe(1);
    expect(manager.get(row.id).status).toBe("stopped");
  });
  it("retains uncertain cleanup when uncertain write fails, then retries on shutdown", async () => {
    let stops = 0;
    let fail = true;
    const { manager, store } = setup({
      stop: async () => {
        stops++;
        if (fail) throw Error("stop");
      },
    });
    const row = await manager.create({ cwd: process.cwd() });
    store.failStatus = "uncertain";
    await expect(manager.shutdownOwned()).rejects.toMatchObject({
      code: "STORE_FAILED",
    });
    expect(stops).toBe(1);
    fail = false;
    await manager.shutdownOwned();
    expect(stops).toBe(2);
    expect(manager.get(row.id).status).toBe("stopped");
  });
});
