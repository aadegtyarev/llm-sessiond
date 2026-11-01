import { describe, expect, it } from "vitest";
import { configured } from "./durable-input-runtime-support.js";

describe("input dispatch fencing after pending publication", () => {
  const cases = [
    { mode: "running", invalidation: "ended" },
    { mode: "running", invalidation: "owner" },
    { mode: "resumed", invalidation: "ended" },
    { mode: "resumed", invalidation: "owner" },
  ] as const;
  it.each(cases)(
    "blocks $invalidation dispatch for $mode input",
    async ({ mode, invalidation }) => {
      const listeners: Array<(event: unknown) => void> = [];
      let writes = 0;
      const { manager, store } = configured({
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
      if (mode === "resumed") await manager.stop(row.id);
      const states: string[] = [];
      const unsubscribe = manager.inputs.subscribe((event) => {
        states.push(event.state);
        if (event.state !== "pending") return;
        if (invalidation === "owner") store.stale = true;
        else listeners.at(-1)!({ kind: "execution-ended" });
      });
      const pending = manager.inputs.submit(row.id, { text: "prompt" });
      await expect(pending).rejects.toMatchObject({
        code: invalidation === "owner" ? "STALE_OWNER" : "INPUT_UNCERTAIN",
        inputId: "input.custom",
        resumed: mode === "resumed",
      });
      expect(writes).toBe(0);
      expect(states).toEqual(["pending", "uncertain"]);
      unsubscribe();
    },
  );
});
