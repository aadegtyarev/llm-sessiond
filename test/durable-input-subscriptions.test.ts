import { describe, expect, it } from "vitest";
import { configured } from "./durable-input-runtime-support.js";

describe("execution input subscriptions", () => {
  it("contains subscribe and unsubscribe exceptions without raw errors or stuck slots", async () => {
    const { manager } = configured({
      submit: async () => ({ kind: "accepted" }),
      cancel: async () => ({ kind: "accepted" }),
      subscribe: () => {
        throw new Error("raw subscribe secret");
      },
    });
    const row = await manager.create({ cwd: process.cwd() });
    const error = await manager.inputs.submit(row.id, { text: "prompt" }).then(
      () => undefined,
      (value: unknown) => value as Error & { code?: string; inputId?: string },
    );
    expect(error).toMatchObject({
      code: "SESSION_UNAVAILABLE",
      inputId: "input.custom",
    });
    expect((error as Error).message).not.toContain("raw subscribe secret");
    await expect(
      manager.inputs.submit(row.id, { text: "retry" }),
    ).rejects.toMatchObject({ code: "SESSION_UNAVAILABLE" });
  });
  it("returns resumed metadata when subscription fails during auto-resume", async () => {
    const { manager } = configured({
      submit: async () => ({ kind: "accepted" }),
      cancel: async () => ({ kind: "accepted" }),
      subscribe: () => {
        throw new Error("raw resume secret");
      },
    });
    const row = await manager.create({ cwd: process.cwd() });
    await manager.stop(row.id);
    const error = await manager.inputs.submit(row.id, { text: "prompt" }).then(
      () => undefined,
      (value: unknown) =>
        value as Error & { code?: string; inputId?: string; resumed?: boolean },
    );
    expect(error).toMatchObject({
      code: "SESSION_UNAVAILABLE",
      inputId: "input.custom",
      resumed: true,
    });
    expect((error as Error).message).not.toContain("raw resume secret");
    expect(manager.get(row.id).status).toBe("running");
  });
});
