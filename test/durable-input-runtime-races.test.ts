import { describe, expect, it } from "vitest";
import { configured } from "./durable-input-runtime-support.js";

describe("durable input races", () => {
  it("does not reopen early terminal settlement when acknowledgement arrives late", async () => {
    let emit!: (event: unknown) => void;
    let resolveAck!: (value: {
      kind: "rejected";
      reason: "prompt_rejected";
    }) => void;
    const { manager } = configured({
      submit: async () =>
        new Promise((resolve) => {
          resolveAck = resolve;
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
    emit({ inputId: "input.custom", state: "completed" });
    resolveAck({ kind: "rejected", reason: "prompt_rejected" });
    await expect(pending).rejects.toMatchObject({
      code: "INPUT_REJECTED",
      inputId: "input.custom",
      failureReason: "prompt_rejected",
    });
    expect(states).toEqual(["pending", "completed"]);
  });
  it("turns acknowledgement timeout into uncertainty without replay", async () => {
    let release!: (value: { kind: "accepted" }) => void;
    const { manager } = configured(
      {
        submit: async () =>
          new Promise((resolve) => {
            release = resolve;
          }),
        cancel: async () => ({ kind: "accepted" }),
      },
      undefined,
      2,
    );
    const row = await manager.create({ cwd: process.cwd() });
    await expect(
      manager.inputs.submit(row.id, { text: "prompt" }),
    ).rejects.toMatchObject({
      code: "INPUT_UNCERTAIN",
      inputId: "input.custom",
    });
    release({ kind: "accepted" });
    await expect(
      manager.inputs.submit(row.id, { text: "no replay" }),
    ).rejects.toMatchObject({ code: "INPUT_BUSY" });
    await manager.stop(row.id);
  });
  it("allows lifecycle stop while the submit acknowledgement is gated", async () => {
    let release!: (value: { kind: "accepted" }) => void;
    const { manager } = configured({
      submit: async () =>
        new Promise((resolve) => {
          release = resolve;
        }),
      cancel: async () => ({ kind: "accepted" }),
    });
    const row = await manager.create({ cwd: process.cwd() });
    const states: string[] = [];
    manager.inputs.subscribe((event) => states.push(event.state));
    const pending = manager.inputs.submit(row.id, { text: "prompt" });
    await new Promise((resolve) => setImmediate(resolve));
    await manager.stop(row.id);
    release({ kind: "accepted" });
    await expect(pending).rejects.toMatchObject({ code: "INPUT_UNCERTAIN" });
    expect(states).toEqual(["pending", "uncertain"]);
  });
});
