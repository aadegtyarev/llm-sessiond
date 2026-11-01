import { describe, expect, it } from "vitest";
import { setup } from "./durable-manager-support.js";
import type { MemoryStore } from "./durable-memory-store.js";
const result = {
  nativeSessionId: "native",
  checkpoint: { namespace: "synthetic.audit", version: 3, data: {} },
};
describe("durable success-transition failures", () => {
  it("cleans execution when atomic identity update fails", async () => {
    let live = false;
    const { manager, store } = setup({
      launch: async () => {
        live = true;
        return result;
      },
      stop: async () => {
        live = false;
      },
    });
    store.failExecutionUpdate = true;
    await expect(manager.create({ cwd: process.cwd() })).rejects.toMatchObject({
      code: "OPERATION_FAILED",
    });
    expect(live).toBe(false);
    expect(store.get("session-1")?.status).toBe("failed");
  });
  it("cleans execution when running status persistence fails", async () => {
    let live = false;
    const { manager, store } = setup({
      launch: async () => {
        live = true;
        return result;
      },
      stop: async () => {
        live = false;
      },
    });
    store.failRunningStatus = true;
    await expect(manager.create({ cwd: process.cwd() })).rejects.toMatchObject({
      code: "OPERATION_FAILED",
    });
    expect(live).toBe(false);
    expect(store.get("session-1")?.status).toBe("failed");
  });
  it("cleans stale-owner execution without rewriting its row", async () => {
    let live = false;
    const storeRef: { current?: MemoryStore } = {};
    const configured = setup({
      launch: async () => {
        live = true;
        storeRef.current!.stale = true;
        return result;
      },
      stop: async () => {
        live = false;
      },
    });
    storeRef.current = configured.store;
    await expect(
      configured.manager.create({ cwd: process.cwd() }),
    ).rejects.toMatchObject({ code: "OPERATION_FAILED" });
    expect(live).toBe(false);
    expect(storeRef.current.get("session-1")?.status).toBe("starting");
  });
  it("cleans execution after the row disappears during launch", async () => {
    let live = false;
    const storeRef: { current?: MemoryStore } = {};
    const configured = setup({
      launch: async () => {
        live = true;
        storeRef.current!.rows.delete("session-1");
        return result;
      },
      stop: async () => {
        live = false;
      },
    });
    storeRef.current = configured.store;
    await expect(
      configured.manager.create({ cwd: process.cwd() }),
    ).rejects.toMatchObject({ code: "OPERATION_FAILED" });
    expect(live).toBe(false);
    expect(storeRef.current.get("session-1")).toBeUndefined();
  });
});
