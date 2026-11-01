import { describe, expect, it } from "vitest";
import { configured } from "./durable-input-runtime-support.js";

describe("input cleanup requires confirmed execution stop", () => {
  const cases = ["pending", "accepted", "canceling"].flatMap((stage) =>
    (["reject", "timeout"] as const).map((mode) => ({ stage, mode })),
  );
  it.each(cases)(
    "$stage input remains owned after $mode, then cleans up on retry",
    async ({ stage, mode }) => {
      let releaseSubmit!: (value: { kind: "accepted" }) => void;
      let releaseCancel!: (value: { kind: "accepted" }) => void;
      let releaseTimedStop!: () => void;
      let stopMode: "reject" | "timeout" | "success" = mode;
      let stops = 0;
      let unsubscribes = 0;
      const { manager } = configured(
        {
          submit: async () => {
            if (stage === "pending")
              return new Promise((resolve) => {
                releaseSubmit = resolve;
              });
            return { kind: "accepted" };
          },
          cancel: async () => {
            if (stage === "canceling")
              return new Promise((resolve) => {
                releaseCancel = resolve;
              });
            return { kind: "accepted" };
          },
          subscribe: () => () => {
            unsubscribes++;
          },
        },
        undefined,
        5000,
        true,
        undefined,
        undefined,
        async () => {
          stops++;
          if (stopMode === "reject") throw new Error("raw stop failure");
          if (stopMode === "timeout")
            await new Promise<void>((resolve) => {
              releaseTimedStop = resolve;
            });
        },
        3,
      );
      const row = await manager.create({ cwd: process.cwd() });
      const states: string[] = [];
      manager.inputs.subscribe((event) => states.push(event.state));
      const pendingSubmit = manager.inputs.submit(row.id, { text: "prompt" });
      await new Promise((resolve) => setImmediate(resolve));
      const stopError =
        mode === "timeout" ? "OPERATION_TIMEOUT" : "OPERATION_FAILED";
      if (stage === "pending") {
        await expect(manager.stop(row.id)).rejects.toMatchObject({
          code: stopError,
        });
        expect(unsubscribes).toBe(0);
        releaseSubmit({ kind: "accepted" });
        await expect(pendingSubmit).rejects.toMatchObject({
          code: "INPUT_UNCERTAIN",
        });
      } else {
        const input = await pendingSubmit;
        if (stage === "canceling") {
          const cancel = manager.inputs.cancelCurrent(row.id);
          await new Promise((resolve) => setImmediate(resolve));
          await expect(manager.stop(row.id)).rejects.toMatchObject({
            code: stopError,
          });
          releaseCancel({ kind: "accepted" });
          await cancel;
        } else {
          await expect(manager.stop(row.id)).rejects.toMatchObject({
            code: stopError,
          });
        }
        expect(input.inputId).toBe("input.custom");
        expect(unsubscribes).toBe(0);
      }
      expect(states.at(-1)).toBe("uncertain");
      stopMode = "success";
      await manager.shutdownOwned();
      expect(stops).toBe(2);
      expect(unsubscribes).toBe(1);
      expect(manager.get(row.id).status).toBe("stopped");
      releaseTimedStop?.();
    },
  );
});
