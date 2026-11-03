import { describe, expect, it } from "vitest";
import { MemorySessionStore } from "../src/adapters/memory-store.js";
import { SessionRuntime } from "../src/kernel/index.js";
import { DelayedHarness } from "./session-runtime-delayed-harness.js";

describe("session stop races", () => {
  it("fences a pending ACK and stale source events after resume", async () => {
    let id = 0;
    const harness = new DelayedHarness();
    const core = new SessionRuntime(
      new MemorySessionStore(),
      harness,
      () => ["Session3", "Input3", "Input4"][id++]!,
    );
    const session = await core.create({ cwd: "/tmp" });
    const submission = core.submit(session.id, "one");
    await Promise.resolve();
    const oldSource = harness.emit!;
    expect(await core.stop(session.id)).toBe(true);
    harness.ack?.({ kind: "accepted" });
    await submission;
    await core.resume(session.id);
    oldSource({ kind: "settled", sessionId: session.id, inputId: "Input3" });
    const next = core.submit(session.id, "two");
    await Promise.resolve();
    harness.ack?.({ kind: "accepted" });
    await expect(next).resolves.toMatchObject({
      resumed: false,
      inputId: "Input4",
    });
    expect(harness.writes).toBe(2);
  });

  it("closes admission synchronously and drains confirmed sessions once", async () => {
    let id = 0;
    const harness = new DelayedHarness();
    const core = new SessionRuntime(
      new MemorySessionStore(),
      harness,
      () => ["Session5", "Input5", "Input6"][id++]!,
    );
    const session = await core.create({ cwd: "/tmp" });
    const submission = core.submit(session.id, "one");
    await Promise.resolve();
    const shutdown = core.shutdown();
    expect(core.shutdown()).toBe(shutdown);
    await expect(core.submit(session.id, "two")).rejects.toThrow(
      "Runtime unavailable",
    );
    expect(await shutdown).toBe(true);
    harness.ack?.({ kind: "accepted" });
    expect(await submission).toMatchObject({ outcome: "unknown" });
    expect((await core.get(session.id))?.status).toBe("stopped");
  });
});
