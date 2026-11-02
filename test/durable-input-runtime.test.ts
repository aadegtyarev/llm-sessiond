import { describe, expect, it } from "vitest";
import { configured } from "./durable-input-runtime-support.js";

describe("durable input runtime", () => {
  it("admits opaque IDs, publishes acceptance, and cancels only exact current input", async () => {
    const calls: string[] = [];
    const configuredRuntime = configured({
      submit: async ({ inputId }) => {
        calls.push(`submit:${inputId}`);
        return { kind: "accepted" };
      },
      cancel: async (id) => {
        calls.push(`cancel:${id}`);
        return { kind: "accepted" };
      },
    });
    const { manager } = configuredRuntime;
    const row = await manager.create({ cwd: process.cwd() });
    const events: string[] = [];
    manager.inputs.subscribe((event) =>
      events.push(`${event.inputId}:${event.state}`),
    );
    const result = await manager.inputs.submit(row.id, {
      text: "",
      images: [],
    });
    expect(result).toEqual({ inputId: "input.custom", resumed: false });
    await expect(manager.inputs.cancel(row.id, "wrong")).rejects.toMatchObject({
      code: "INPUT_NOT_CURRENT",
    });
    await manager.inputs.cancel(row.id, result.inputId);
    expect(calls).toEqual(["submit:input.custom", "cancel:input.custom"]);
    expect(events).toEqual(["input.custom:pending", "input.custom:accepted"]);
  });
  it("preflights image capability before stopped-session resume", async () => {
    const { manager } = configured(
      {
        submit: async () => ({ kind: "accepted" }),
        cancel: async () => ({ kind: "accepted" }),
      },
      undefined,
      5000,
      false,
    );
    const row = await manager.create({ cwd: process.cwd() });
    await manager.stop(row.id);
    await expect(
      manager.inputs.submit(row.id, {
        text: "",
        images: [{ mimeType: "image/png", data: "AQ==" }],
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_CAPABILITY" });
    expect(manager.get(row.id).status).toBe("stopped");
  });
  it("rejects invalid payload before auto-resume or dispatch", async () => {
    let dispatches = 0;
    let factories = 0;
    const { manager } = configured(
      {
        submit: async () => {
          dispatches++;
          return { kind: "accepted" };
        },
        cancel: async () => ({ kind: "accepted" }),
      },
      undefined,
      5000,
      true,
      () => factories++,
    );
    const row = await manager.create({ cwd: process.cwd() });
    await manager.stop(row.id);
    const before = factories;
    const overLimit = Buffer.alloc(20 * 1024 * 1024 + 1).toString("base64");
    for (const images of [
      [{ mimeType: "image/png", data: "AB==" }],
      [{ mimeType: "image/png", data: overLimit }],
    ]) {
      await expect(
        manager.inputs.submit(row.id, { text: "", images }),
      ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    }
    await expect(
      manager.inputs.submit(row.id, { text: "x".repeat(262145) }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(manager.get(row.id).status).toBe("stopped");
    expect(factories).toBe(before);
    expect(dispatches).toBe(0);
  });
});
