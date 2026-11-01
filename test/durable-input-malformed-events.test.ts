import { describe, expect, it } from "vitest";
import { configured } from "./durable-input-runtime-support.js";

describe("malformed execution input events", () => {
  it("rejects coercible and exotic states without settling or publishing them", async () => {
    let emit!: (event: unknown) => void;
    let writes = 0;
    const { manager } = configured({
      submit: async () => {
        writes++;
        return { kind: "accepted" };
      },
      cancel: async () => ({ kind: "accepted" }),
      subscribe: (listener) => {
        emit = listener;
        return () => {};
      },
    });
    const row = await manager.create({ cwd: process.cwd() });
    const observed: unknown[] = [];
    manager.inputs.subscribe((event) => observed.push(event));
    const first = await manager.inputs.submit(row.id, { text: "held" });
    const beforeMalformed = [...observed];
    const states: unknown[] = [
      ["completed"],
      new String("completed"),
      {
        toString() {
          throw new Error("coercion secret");
        },
      },
      Object.create(null),
    ];
    for (const state of states) emit({ inputId: first.inputId, state });
    emit(
      Object.assign(Object.create(null), {
        inputId: first.inputId,
        state: "completed",
      }),
    );
    expect(observed).toEqual(beforeMalformed);
    expect(observed.map((event) => (event as { state: string }).state)).toEqual(
      ["pending", "accepted"],
    );
    await expect(
      manager.inputs.submit(row.id, { text: "still busy" }),
    ).rejects.toMatchObject({ code: "INPUT_BUSY" });
    expect(writes).toBe(1);
  });
});
