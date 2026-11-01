import { describe, expect, it } from "vitest";
import { configured } from "./durable-input-runtime-support.js";

describe("input execution termination", () => {
  it("marks unresolved input uncertain on exit and ignores late acknowledgement", async () => {
    let emit!: (event: unknown) => void;
    let accept!: (value: { kind: "accepted" }) => void;
    const { manager } = configured({
      submit: async () =>
        new Promise((resolve) => {
          accept = resolve;
        }),
      cancel: async () => ({ kind: "accepted" }),
      subscribe: (listener) => {
        emit = listener;
        return () => {};
      },
    });
    const row = await manager.create({ cwd: process.cwd() });
    const states: string[] = [];
    manager.inputs.subscribe((event) => states.push(event.state));
    const pending = manager.inputs.submit(row.id, { text: "prompt" });
    await new Promise((resolve) => setImmediate(resolve));
    emit({ kind: "execution-ended" });
    accept({ kind: "accepted" });
    await pending;
    expect(states).toEqual(["pending", "uncertain"]);
  });
});
