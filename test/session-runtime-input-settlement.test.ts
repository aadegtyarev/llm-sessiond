import { describe, expect, it } from "vitest";
import { MemorySessionStore } from "../src/adapters/memory-store.js";
import { SessionRuntime } from "../src/kernel/index.js";
import { DelayedHarness } from "./session-runtime-delayed-harness.js";

describe("input settlement", () => {
  it("keeps ACK pending nonterminal and admission busy", async () => {
    let id = 0;
    const harness = new DelayedHarness();
    const core = new SessionRuntime(
      new MemorySessionStore(),
      harness,
      () => ["Session1", "Input1", "Input2"][id++]!,
    );
    const session = await core.create({ cwd: "/tmp" });
    const submission = core.submit(session.id, "one");
    await Promise.resolve();
    harness.ack?.({ kind: "accepted" });
    expect((await submission).inputId).toBe("Input1");
    expect(harness.writes).toBe(1);
    await expect(core.submit(session.id, "two")).rejects.toThrow("Input busy");
  });

  it("does not resurrect early terminal settlement after a late ACK", async () => {
    let id = 0;
    const harness = new DelayedHarness();
    const core = new SessionRuntime(
      new MemorySessionStore(),
      harness,
      () => ["Session2", "Input2"][id++]!,
    );
    const session = await core.create({ cwd: "/tmp" });
    const states: string[] = [];
    core.subscribe((event) => {
      if (event.kind === "input.state") states.push(event.input!.state);
    });
    const submission = core.submit(session.id, "one");
    await Promise.resolve();
    harness.emit?.({
      kind: "settled",
      sessionId: session.id,
      inputId: "Input2",
    });
    harness.ack?.({ kind: "accepted" });
    await submission;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(states).toContain("completed");
    expect(states).not.toContain("accepted");
  });
});
