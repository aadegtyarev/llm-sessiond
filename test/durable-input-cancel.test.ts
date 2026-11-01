import { describe, expect, it } from "vitest";
import { configured } from "./durable-input-runtime-support.js";

describe("durable input cancellation", () => {
  it("requires accepted input and never repeats an uncertain cancellation", async () => {
    let releaseSubmit!: (value: { kind: "accepted" }) => void;
    let cancelWrites = 0;
    const { manager } = configured(
      {
        submit: async () =>
          new Promise((resolve) => {
            releaseSubmit = resolve;
          }),
        cancel: async () => {
          cancelWrites++;
          return new Promise(() => {});
        },
      },
      undefined,
      2,
    );
    const row = await manager.create({ cwd: process.cwd() });
    const pending = manager.inputs.submit(row.id, { text: "prompt" });
    await new Promise((resolve) => setImmediate(resolve));
    await expect(
      manager.inputs.cancel(row.id, "input.custom"),
    ).rejects.toMatchObject({ code: "INPUT_BUSY" });
    releaseSubmit({ kind: "accepted" });
    await pending;
    await expect(manager.inputs.cancelCurrent(row.id)).rejects.toMatchObject({
      code: "INPUT_UNCERTAIN",
    });
    await expect(manager.inputs.cancelCurrent(row.id)).rejects.toMatchObject({
      code: "INPUT_UNCERTAIN",
    });
    expect(cancelWrites).toBe(1);
    await manager.stop(row.id);
  });
});
