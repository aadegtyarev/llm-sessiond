import { describe, expect, it } from "vitest";
import { configured } from "./durable-input-runtime-support.js";

describe("late input outcomes", () => {
  it.each(["completed", "failed"] as const)(
    "does not affect a new input after early %s settlement",
    async (terminal) => {
      let emit!: (event: unknown) => void;
      let lateAccept!: (value: { kind: "accepted" }) => void;
      let submits = 0;
      const { manager } = configured({
        submit: async () => {
          submits++;
          return submits === 1
            ? new Promise((resolve) => {
                lateAccept = resolve;
              })
            : { kind: "accepted" as const };
        },
        cancel: async () => ({ kind: "accepted" }),
        subscribe: (listener) => {
          emit = listener;
          return () => {};
        },
      });
      const row = await manager.create({ cwd: process.cwd() });
      const states: string[] = [];
      manager.inputs.subscribe((event) =>
        states.push(`${event.inputId}:${event.state}`),
      );
      const first = manager.inputs.submit(row.id, { text: "first" });
      await new Promise((resolve) => setImmediate(resolve));
      emit({
        inputId: "input.custom",
        state: terminal,
        ...(terminal === "failed" ? { reason: "prompt_rejected" } : {}),
      });
      const second = await manager.inputs.submit(row.id, { text: "second" });
      lateAccept({ kind: "accepted" });
      if (terminal === "failed")
        await expect(first).rejects.toMatchObject({
          code: "INPUT_REJECTED",
          failureReason: "prompt_rejected",
        });
      else
        await expect(first).resolves.toEqual({
          inputId: "input.custom",
          resumed: false,
        });
      expect(second).toEqual({ inputId: "input.next", resumed: false });
      expect(states).toEqual([
        "input.custom:pending",
        `input.custom:${terminal}`,
        "input.next:pending",
        "input.next:accepted",
      ]);
      await manager.stop(row.id);
    },
  );
});
