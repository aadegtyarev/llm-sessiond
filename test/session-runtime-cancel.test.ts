import { describe, expect, it } from "vitest";
import { MemorySessionStore } from "../src/adapters/memory-store.js";
import { SessionRuntime } from "../src/kernel/index.js";
import { DelayedHarness } from "./session-runtime-delayed-harness.js";

describe("input cancellation", () => {
  it("does not treat cancel ACK as settlement or send duplicate cancellation", async () => {
    let id = 0;
    const harness = new DelayedHarness();
    const core = new SessionRuntime(
      new MemorySessionStore(),
      harness,
      () => ["Session4", "Input4"][id++]!,
    );
    const session = await core.create({ cwd: "/tmp" });
    const states: Array<{ state: string; reason?: string }> = [];
    core.subscribe((event) => {
      if (event.kind === "input.state")
        states.push({
          state: event.input!.state,
          ...(event.input!.reason === undefined
            ? {}
            : { reason: event.input!.reason }),
        });
    });
    const submission = core.submit(session.id, "one");
    await Promise.resolve();
    harness.ack?.({ kind: "accepted" });
    await submission;
    expect(await core.cancelCurrent(session.id)).toEqual({ kind: "accepted" });
    await expect(core.cancel(session.id, "Input4")).rejects.toThrow(
      "Input not current",
    );
    expect(harness.cancels).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(states.some((item) => item.state === "accepted")).toBe(true);
    expect(
      states.some(
        (item) => item.state === "completed" || item.state === "failed",
      ),
    ).toBe(false);
    harness.emit?.({
      kind: "settled",
      sessionId: session.id,
      inputId: "Input4",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(states.at(-1)).toEqual({ state: "failed", reason: "canceled" });
  });
});
