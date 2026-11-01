import { describe, expect, it } from "vitest";
import { configured } from "./durable-input-runtime-support.js";

describe("input execution generation fencing", () => {
  it("ignores ended callbacks from an execution after confirmed replacement", async () => {
    const listeners: Array<(event: unknown) => void> = [];
    let writes = 0;
    const { manager } = configured({
      submit: async () => {
        writes++;
        return { kind: "accepted" };
      },
      cancel: async () => ({ kind: "accepted" }),
      subscribe: (listener) => {
        listeners.push(listener);
        return () => {};
      },
    });
    const row = await manager.create({ cwd: process.cwd() });
    await manager.inputs.submit(row.id, { text: "old" });
    const oldSource = listeners[0]!;
    await manager.stop(row.id);
    await manager.resume(row.id);
    oldSource({ kind: "execution-ended" });
    const next = await manager.inputs.submit(row.id, { text: "new" });
    expect(next.inputId).toBe("input.next");
    expect(writes).toBe(2);
    await manager.stop(row.id);
  });
});
