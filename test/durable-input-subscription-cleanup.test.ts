import { expect, it } from "vitest";
import { configured } from "./durable-input-runtime-support.js";

it("preserves class-method receiver for subscribe", async () => {
  const port = {
    listeners: new Set<(event: unknown) => void>(),
    submit: async () => ({ kind: "accepted" as const }),
    cancel: async () => ({ kind: "accepted" as const }),
    subscribe(listener: (event: unknown) => void) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    },
  };
  const { manager } = configured(port);
  const row = await manager.create({ cwd: process.cwd() });
  await expect(
    manager.inputs.submit(row.id, { text: "ok" }),
  ).resolves.toMatchObject({ inputId: "input.custom" });
  await manager.stop(row.id);
  expect(port.listeners.size).toBe(0);
});

it.each(["completed", "failed"] as const)(
  "contains unsubscribe exceptions after %s input and confirmed stop",
  async (state) => {
    let emit!: (event: unknown) => void;
    const { manager } = configured({
      submit: async () => ({ kind: "accepted" }),
      cancel: async () => ({ kind: "accepted" }),
      subscribe: (listener) => {
        emit = listener;
        return () => {
          throw new Error("cleanup secret");
        };
      },
    });
    const row = await manager.create({ cwd: process.cwd() });
    const result = await manager.inputs.submit(row.id, { text: "prompt" });
    emit({
      inputId: result.inputId,
      state,
      ...(state === "failed" ? { reason: "prompt_rejected" } : {}),
    });
    await expect(manager.stop(row.id)).resolves.toMatchObject({
      status: "stopped",
    });
    await manager.resume(row.id);
    await expect(
      manager.inputs.submit(row.id, { text: "next" }),
    ).resolves.toMatchObject({ inputId: "input.next" });
    await manager.stop(row.id);
  },
);

it("contains unsubscribe exceptions during confirmed shutdown and releases its slot", async () => {
  const listeners: Array<(event: unknown) => void> = [];
  const { manager } = configured({
    submit: async () => ({ kind: "accepted" }),
    cancel: async () => ({ kind: "accepted" }),
    subscribe: (listener) => {
      listeners.push(listener);
      return () => {
        throw new Error("cleanup secret");
      };
    },
  });
  const row = await manager.create({ cwd: process.cwd() });
  const result = await manager.inputs.submit(row.id, { text: "prompt" });
  await expect(manager.shutdownOwned()).resolves.toBeUndefined();
  listeners[0]!({ inputId: result.inputId, state: "completed" });
  expect(manager.get(row.id).status).toBe("stopped");
  await expect(
    manager.inputs.submit(row.id, { text: "new" }),
  ).resolves.toMatchObject({ inputId: "input.next", resumed: true });
  await manager.stop(row.id);
});
