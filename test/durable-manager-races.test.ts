import { describe, expect, it } from "vitest";
import { setup } from "./durable-manager-support.js";
describe("mixed lifecycle operation queue", () => {
  it("orders stop, rename, delete, and resume without overlapping ownership", async () => {
    let release!: () => void;
    let stopCalls = 0;
    let resumeCalls = 0;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { manager } = setup({
      stop: async () => {
        stopCalls++;
        await gate;
      },
      resume: async () => {
        resumeCalls++;
        return {};
      },
    });
    const row = await manager.create({ cwd: process.cwd() });
    const stopping = manager.stop(row.id);
    const renaming = manager.rename(row.id, "queued");
    const deleting = manager.delete(row.id);
    const resuming = manager.resume(row.id);
    await Promise.resolve();
    expect(stopCalls).toBe(1);
    expect(resumeCalls).toBe(0);
    release();
    await stopping;
    expect((await renaming).name).toBe("queued");
    await deleting;
    await expect(resuming).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(resumeCalls).toBe(0);
    expect(() => manager.get(row.id)).toThrow();
  });
});
