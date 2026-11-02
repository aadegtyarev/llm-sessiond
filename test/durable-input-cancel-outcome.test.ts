import { describe, expect, it } from "vitest";
import { configured } from "./durable-input-runtime-support.js";

describe("generic exact cancellation outcomes", () => {
  it("targets the exact current ID and leaves accepted state after abort rejection", async () => {
    const calls: string[] = [];
    let attempts = 0;
    const runtime = configured({
      submit: async () => ({ kind: "accepted" }),
      cancel: async (id) => {
        calls.push(id);
        if (attempts++ === 0) return { kind: "rejected" };
        return { kind: "accepted" };
      },
    });
    try {
      const session = await runtime.manager.create({ cwd: process.cwd() });
      const submitted = await runtime.manager.inputs.submit(session.id, {
        text: "x",
      });
      await expect(
        runtime.manager.inputs.cancelCurrent(session.id),
      ).rejects.toMatchObject({
        code: "OPERATION_FAILED",
        failureReason: undefined,
      });
      await runtime.manager.inputs.cancel(session.id, submitted.inputId);
      expect(calls).toEqual([submitted.inputId, submitted.inputId]);
    } finally {
      await runtime.manager.shutdownOwned();
    }
  });

  it("does not hide stale abort rejection after live settlement", async () => {
    const listeners = new Set<(event: unknown) => void>();
    let rejectAbort!: (value: { kind: "rejected" }) => void;
    let entered!: () => void;
    const called = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const runtime = configured({
      submit: async () => ({ kind: "accepted" }),
      cancel: () =>
        new Promise((resolve) => {
          rejectAbort = resolve;
          entered();
        }),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    });
    try {
      const session = await runtime.manager.create({ cwd: process.cwd() });
      const submitted = await runtime.manager.inputs.submit(session.id, {
        text: "x",
      });
      const cancel = runtime.manager.inputs.cancel(
        session.id,
        submitted.inputId,
      );
      await called;
      for (const listener of listeners)
        listener({ inputId: submitted.inputId, state: "completed" });
      rejectAbort!({ kind: "rejected" });
      await expect(cancel).rejects.toMatchObject({ code: "OPERATION_FAILED" });
    } finally {
      await runtime.manager.shutdownOwned();
    }
  });
});
