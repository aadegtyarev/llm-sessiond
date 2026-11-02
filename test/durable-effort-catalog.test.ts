import { describe, expect, it, vi } from "vitest";
import { setup, synthetic } from "./durable-manager-support.js";

const effortAdapter = {
  ...synthetic,
  descriptor: {
    ...synthetic.descriptor,
    capabilities: [...synthetic.descriptor.capabilities, "effort.read"],
  },
};

describe("durable effort catalog routing", () => {
  it("returns a fresh standard catalog from the optional typed port", async () => {
    const levels = ["custom", " vendor "];
    const readEffortCatalog = vi.fn(async () => ({ levels }));
    const { manager } = setup({
      adapter: effortAdapter,
      effortCatalog: { readEffortCatalog },
    });
    const session = await manager.create({ cwd: process.cwd() });
    const result = await manager.readEffortCatalog(session.id);
    expect(result).toEqual({ levels });
    expect(result.levels).not.toBe(levels);
    levels[0] = "mutated";
    expect(result.levels[0]).toBe("custom");
    expect(readEffortCatalog).toHaveBeenCalledOnce();
  });
  it("rejects unsupported, stopped, missing-port and malformed results", async () => {
    const readEffortCatalog = vi.fn(async () => ({ levels: [] }));
    const { manager } = setup({ effortCatalog: { readEffortCatalog } });
    const session = await manager.create({ cwd: process.cwd() });
    await expect(manager.readEffortCatalog(session.id)).rejects.toMatchObject({
      code: "UNSUPPORTED_CAPABILITY",
    });
    await manager.stop(session.id);
    await expect(manager.readEffortCatalog(session.id)).rejects.toMatchObject({
      code: "SESSION_NOT_RUNNING",
    });
    expect(readEffortCatalog).not.toHaveBeenCalled();
    const missing = setup({ adapter: effortAdapter });
    const running = await missing.manager.create({ cwd: process.cwd() });
    await expect(
      missing.manager.readEffortCatalog(running.id),
    ).rejects.toMatchObject({
      code: "SESSION_UNAVAILABLE",
    });
    const malformed = setup({
      adapter: effortAdapter,
      effortCatalog: {
        readEffortCatalog: async () => ({ levels: ["valid"], extra: "reject" }),
      },
    });
    const active = await malformed.manager.create({ cwd: process.cwd() });
    await expect(
      malformed.manager.readEffortCatalog(active.id),
    ).rejects.toMatchObject({
      code: "OPERATION_FAILED",
    });
  });
});
