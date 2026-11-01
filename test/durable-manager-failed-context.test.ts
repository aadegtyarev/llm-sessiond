import { describe, expect, it } from "vitest";
import { setup, checkpoint } from "./durable-manager-support.js";
describe("failed-session resume context", () => {
  it("forwards stored cwd/options/checkpoint/native ID without launching", async () => {
    const cwd = process.cwd();
    const options = { profile: "failed-context" };
    const { manager, store, calls } = setup();
    store.create({
      id: "failed",
      harnessId: "synthetic",
      cwd,
      adapterOptions: options,
      nativeSessionId: "native-exact",
      adapterState: checkpoint(12),
      status: "failed",
      failureReason: "LAUNCH_FAILED",
      failedAt: "safe",
      createdAt: "then",
    });
    const row = await manager.resume("failed");
    expect(row.status).toBe("running");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain(`"cwd":"${cwd}"`);
    expect(calls[0]).toContain('"options":{"profile":"failed-context"}');
    expect(calls[0]).toContain('"nativeSessionId":"native-exact"');
    expect(calls[0]).toContain('"cursor":12');
  });
});
