import { describe, expect, it } from "vitest";
import { setup } from "./durable-manager-support.js";
describe("durable finalization persistence failures", () => {
  it("retains a cleaned launch execution until failed status is durable", async () => {
    let live = false;
    const { manager, store } = setup({
      launch: async () => {
        live = true;
        throw Error("raw");
      },
      stop: async () => {
        live = false;
      },
    });
    store.failStatus = "failed";
    await expect(manager.create({ cwd: process.cwd() })).rejects.toMatchObject({
      code: "STORE_FAILED",
    });
    expect(live).toBe(false);
    await expect(manager.create({ cwd: process.cwd() })).rejects.toMatchObject({
      code: "SESSION_ID_COLLISION",
    });
    await manager.shutdownOwned();
    expect(manager.get("session-1").status).toBe("failed");
  });
  it("retains live cleanup and pending status after uncertain write failure", async () => {
    let live = false;
    let cleanupFails = true;
    const { manager, store } = setup({
      launch: async () => {
        live = true;
        throw Error("partial");
      },
      stop: async () => {
        if (cleanupFails) throw Error("cleanup");
        live = false;
      },
    });
    store.failStatus = "uncertain";
    await expect(manager.create({ cwd: process.cwd() })).rejects.toMatchObject({
      code: "STORE_FAILED",
    });
    expect(live).toBe(true);
    await expect(manager.create({ cwd: process.cwd() })).rejects.toMatchObject({
      code: "SESSION_ID_COLLISION",
    });
    cleanupFails = false;
    await manager.shutdownOwned();
    expect(live).toBe(false);
    expect(manager.get("session-1").status).toBe("failed");
  });
  it("applies the same pending finalizer after resume rejection", async () => {
    let live = false;
    const { manager, store } = setup({
      resume: async () => {
        live = true;
        throw Error("resume");
      },
      stop: async () => {
        live = false;
      },
    });
    const row = await manager.create({ cwd: process.cwd() });
    await manager.stop(row.id);
    store.failStatus = "failed";
    await expect(manager.resume(row.id)).rejects.toMatchObject({
      code: "STORE_FAILED",
    });
    expect(live).toBe(false);
    await expect(manager.resume(row.id)).rejects.toMatchObject({
      code: "SESSION_UNAVAILABLE",
    });
    await manager.shutdownOwned();
    expect(manager.get(row.id).status).toBe("failed");
  });
});
