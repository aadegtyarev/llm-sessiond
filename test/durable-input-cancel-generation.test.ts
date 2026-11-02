import { describe, expect, it } from "vitest";
import { configured } from "./durable-input-runtime-support.js";

describe("stale cancellation generation fences", () => {
  it("does not let an old abort rejection replace a resumed input", async () => {
    let rejectOld!: (value: { kind: "rejected" }) => void;
    let entered!: () => void;
    const enteredCancel = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let cancels = 0;
    const runtime = configured({
      submit: async () => ({ kind: "accepted" }),
      cancel: () => {
        if (cancels++ > 0) return Promise.resolve({ kind: "accepted" });
        return new Promise((resolve) => {
          rejectOld = resolve;
          entered();
        });
      },
    });
    try {
      const session = await runtime.manager.create({ cwd: process.cwd() });
      const first = await runtime.manager.inputs.submit(session.id, {
        text: "old",
      });
      const oldCancel = runtime.manager.inputs.cancel(
        session.id,
        first.inputId,
      );
      await enteredCancel;
      await runtime.manager.stop(session.id);
      await runtime.manager.resume(session.id);
      const next = await runtime.manager.inputs.submit(session.id, {
        text: "new",
      });
      rejectOld!({ kind: "rejected" });
      await expect(oldCancel).rejects.toMatchObject({
        code: "OPERATION_FAILED",
      });
      await runtime.manager.inputs.cancelCurrent(session.id);
      expect(next.inputId).not.toBe(first.inputId);
    } finally {
      await runtime.manager.shutdownOwned();
    }
  });
});
