import { describe, expect, it } from "vitest";
import { setup, synthetic } from "./durable-manager-support.js";
describe("durable manager boundaries", () => {
  it("keeps capability subsets explicit and supports a third-party descriptor", async () => {
    const adapter = {
      ...synthetic,
      descriptor: { ...synthetic.descriptor, capabilities: ["harness.launch"] },
    };
    const { manager } = setup({ adapter });
    const row = await manager.create({
      cwd: process.cwd(),
      harnessId: "third",
    });
    expect(row.harnessId).toBe("synthetic");
    await expect(manager.stop(row.id)).rejects.toMatchObject({
      code: "UNSUPPORTED_CAPABILITY",
    });
    expect(manager.descriptor("synthetic").id).toBe("synthetic");
  });
  it("preserves records on missing adapter or unknown checkpoint", async () => {
    const missing = setup();
    missing.store.create({
      id: "old",
      harnessId: "gone",
      cwd: "/work",
      status: "stopped",
      createdAt: "old",
    });
    await expect(missing.manager.resume("old")).rejects.toMatchObject({
      code: "UNKNOWN_ADAPTER",
    });
    expect(missing.store.get("old")?.status).toBe("stopped");
    const unknown = setup();
    unknown.store.create({
      id: "old",
      harnessId: "synthetic",
      cwd: "/work",
      status: "stopped",
      createdAt: "old",
      adapterState: { namespace: "synthetic.audit", version: 99, data: {} },
    });
    await expect(unknown.manager.resume("old")).rejects.toMatchObject({
      code: "UNKNOWN_CHECKPOINT",
    });
    expect(unknown.store.get("old")?.status).toBe("stopped");
  });
  it("renames metadata and reports generated identifier collisions deterministically", async () => {
    const { manager, calls } = setup();
    const row = await manager.create({ cwd: process.cwd() });
    expect((await manager.rename(row.id, "new name")).name).toBe("new name");
    await expect(manager.create({ cwd: process.cwd() })).rejects.toMatchObject({
      code: "SESSION_ID_COLLISION",
    });
    expect(calls.filter((call) => call.startsWith("launch"))).toHaveLength(1);
  });
  it("rejects stale store owners before creating or launching", async () => {
    const { manager, store, calls } = setup({
      owner: { token: "stale", generation: 2 },
    });
    await expect(manager.create({ cwd: process.cwd() })).rejects.toMatchObject({
      code: "STALE_OWNER",
    });
    expect(store.list()).toEqual([]);
    expect(calls).toEqual([]);
  });
  it("constructs without invoking adapter execution", () => {
    const { calls } = setup();
    expect(calls).toEqual([]);
  });
});
