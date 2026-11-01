import { expect, it } from "vitest";
import { configured } from "./durable-input-runtime-support.js";

it("confirms a replacement source with cancellation acknowledgement gated", async () => {
  let resolveCancel!: (value: { kind: "accepted" }) => void;
  let cancelStarted!: () => void;
  let unsubscribes = 0;
  const started = new Promise<void>((resolve) => {
    cancelStarted = resolve;
  });
  const { manager } = configured({
    submit: async () => ({ kind: "accepted" }),
    cancel: async () => {
      cancelStarted();
      return new Promise((resolve) => {
        resolveCancel = resolve;
      });
    },
    subscribe: () => () => {
      unsubscribes++;
    },
  });
  const row = await manager.create({ cwd: process.cwd() });
  await manager.stop(row.id);
  await manager.resume(row.id);
  const states: string[] = [];
  manager.inputs.subscribe((event) => states.push(event.state));
  const input = await manager.inputs.submit(row.id, { text: "prompt" });
  const cancel = manager.inputs.cancelCurrent(row.id);
  const cancelResult = cancel.then(
    () => ({ ok: true }),
    (error: unknown) => ({ error }),
  );
  await started;
  try {
    await manager.shutdownOwned();
    expect(unsubscribes).toBe(2);
    expect(states).toEqual(["pending", "accepted", "uncertain"]);
    resolveCancel({ kind: "accepted" });
    await expect(cancelResult).resolves.toMatchObject({ ok: true });
    expect(states).toEqual(["pending", "accepted", "uncertain"]);
    expect(input.inputId).toBe("input.custom");
  } finally {
    resolveCancel?.({ kind: "accepted" });
  }
});
