import { describe, expect, it } from "vitest";
import { flushEvents, setup } from "./durable-manager-support.js";

describe("durable session events", () => {
  it("fences stale execution output and getter reentrancy", async () => {
    let deliver: ((event: unknown) => void) | undefined;
    const { manager } = setup({
      events: {
        subscribe: (listener) => {
          deliver = listener;
          return () => {
            deliver = undefined;
          };
        },
      },
    });
    const seen: string[] = [];
    const outputs: unknown[] = [];
    manager.events.subscribe(({ event }) => {
      if (event.kind === "harness.event") {
        seen.push(event.event.kind);
        outputs.push(event);
      }
    });
    const session = await manager.create({ cwd: process.cwd() });
    deliver?.({
      kind: "output",
      text: "safe text",
      inputId: "must-not-escape",
      rpc: "private",
    });
    await flushEvents();
    await manager.stop(session.id);
    deliver?.({ kind: "output", text: "late text" });
    await flushEvents();
    expect(seen).toEqual(["output"]);
    expect(outputs).toEqual([
      {
        kind: "harness.event",
        sessionId: session.id,
        event: { kind: "output", text: "safe text" },
      },
    ]);
  });
  it("captures producer getters before the owner/closing fence", async () => {
    let deliver: ((event: unknown) => void) | undefined;
    const { manager } = setup({
      events: {
        subscribe: (listener) => {
          deliver = listener;
          return () => {};
        },
      },
    });
    const seen: string[] = [];
    manager.events.subscribe(({ event }) => {
      if (event.kind === "harness.event") seen.push(event.event.kind);
    });
    await manager.create({ cwd: process.cwd() });
    deliver?.({
      get kind() {
        manager.closeAdmission();
        return "output";
      },
      text: "captured",
    });
    expect(seen).toEqual([]);
  });
});
