import { describe, expect, it } from "vitest";
import { setup } from "./durable-manager-support.js";
describe("durable generic lifecycle manager", () => {
  it("resolves default and alias, launches and resumes with exact persisted identity", async () => {
    const { manager, store, calls } = setup();
    const created = await manager.create({
      cwd: process.cwd(),
      options: { profile: "unit" },
    });
    expect(created.harnessId).toBe("synthetic");
    expect(created.status).toBe("running");
    expect(manager.descriptor("third").id).toBe("synthetic");
    await manager.stop(created.id);
    await manager.resume(created.id);
    expect(calls[0]).toBe("launch:starting");
    expect(calls[2]).toContain('"nativeSessionId":"native"');
    expect(calls[2]).toContain('"cursor":4');
    expect(calls[2]).toContain(`"cwd":"${process.cwd()}"`);
    expect(calls[2]).toContain('"options":{"profile":"unit"}');
    expect(store.get(created.id)?.status).toBe("running");
    expect(store.get(created.id)?.nativeSessionId).toBe("native-2");
    expect(store.get(created.id)?.adapterState?.data).toEqual({ cursor: 5 });
  });
  it("rejects deletion while running and never executes adapter on stopped deletion", async () => {
    const { manager, calls } = setup();
    const row = await manager.create({ cwd: process.cwd() });
    await expect(manager.delete(row.id)).rejects.toThrow();
    await manager.stop(row.id);
    const before = calls.length;
    await manager.delete(row.id);
    expect(calls).toHaveLength(before);
  });
});
