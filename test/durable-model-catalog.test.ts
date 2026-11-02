import { describe, expect, it, vi } from "vitest";
import { setup, synthetic } from "./durable-manager-support.js";

const catalogAdapter = {
  ...synthetic,
  descriptor: {
    ...synthetic.descriptor,
    capabilities: [...synthetic.descriptor.capabilities, "models.read"],
  },
};

describe("durable model catalog routing", () => {
  it("returns a fresh standard catalog from an optional execution port", async () => {
    const model = { provider: " p ", id: "id/exact", name: "Exact" };
    const source = { models: [model] };
    const readModelCatalog = vi.fn(async () => source);
    const { manager } = setup({
      adapter: catalogAdapter,
      modelCatalog: { readModelCatalog },
    });
    const session = await manager.create({ cwd: process.cwd() });
    const result = await manager.readModelCatalog(session.id);
    expect(result).toEqual({ models: [model] });
    expect(result.models).not.toBe(source.models);
    expect(result.models[0]).not.toBe(model);
    model.id = "mutated";
    expect(result.models[0]?.id).toBe("id/exact");
    expect(readModelCatalog).toHaveBeenCalledOnce();
  });
  it("fails before dispatch when unsupported, stopped, or port-missing", async () => {
    const readModelCatalog = vi.fn(async () => ({ models: [] }));
    const { manager } = setup({ modelCatalog: { readModelCatalog } });
    const session = await manager.create({ cwd: process.cwd() });
    await expect(manager.readModelCatalog(session.id)).rejects.toMatchObject({
      code: "UNSUPPORTED_CAPABILITY",
    });
    await manager.stop(session.id);
    await expect(manager.readModelCatalog(session.id)).rejects.toMatchObject({
      code: "SESSION_NOT_RUNNING",
    });
    expect(readModelCatalog).not.toHaveBeenCalled();
    const { manager: missingPort } = setup({ adapter: catalogAdapter });
    const running = await missingPort.create({ cwd: process.cwd() });
    await expect(
      missingPort.readModelCatalog(running.id),
    ).rejects.toMatchObject({
      code: "SESSION_UNAVAILABLE",
    });
  });
  it("rejects untrusted fields and snapshots nested values", async () => {
    const { manager } = setup({
      adapter: catalogAdapter,
      modelCatalog: {
        readModelCatalog: async () => ({
          models: [{ provider: "p", id: "i", name: "n", secret: "x" }],
        }),
      },
    });
    const session = await manager.create({ cwd: process.cwd() });
    await expect(manager.readModelCatalog(session.id)).rejects.toMatchObject({
      code: "OPERATION_FAILED",
    });
  });
});
