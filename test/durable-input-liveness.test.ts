import { describe, expect, it } from "vitest";
import { configured } from "./durable-input-runtime-support.js";

describe("execution input liveness", () => {
  it("observes execution-ended while idle between inputs", async () => {
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
    const first = await manager.inputs.submit(row.id, { text: "one" });
    emit({ inputId: first.inputId, state: "completed" });
    emit({ kind: "execution-ended" });
    await expect(
      manager.inputs.submit(row.id, { text: "two" }),
    ).rejects.toMatchObject({ code: "SESSION_UNAVAILABLE" });
    expect(writes).toBe(1);
  });
  it("prevents dispatch when execution ends synchronously during subscription", async () => {
    let writes = 0;
    const { manager } = configured({
      submit: async () => {
        writes++;
        return { kind: "accepted" };
      },
      cancel: async () => ({ kind: "accepted" }),
      subscribe: (listener) => {
        listener({ kind: "execution-ended" });
        return () => {};
      },
    });
    const row = await manager.create({ cwd: process.cwd() });
    await expect(
      manager.inputs.submit(row.id, { text: "never" }),
    ).rejects.toMatchObject({ code: "SESSION_UNAVAILABLE" });
    expect(writes).toBe(0);
  });
});
