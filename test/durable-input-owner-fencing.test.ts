import { describe, expect, it } from "vitest";
import { configured } from "./durable-input-runtime-support.js";

describe("input owner fencing", () => {
  it("rejects stale-owner running submit before input events or adapter writes", async () => {
    let writes = 0;
    const { manager, store } = configured({
      submit: async () => {
        writes++;
        return { kind: "accepted" };
      },
      cancel: async () => ({ kind: "accepted" }),
    });
    const row = await manager.create({ cwd: process.cwd() });
    const events: string[] = [];
    manager.inputs.subscribe((event) => events.push(event.state));
    store.stale = true;
    await expect(
      manager.inputs.submit(row.id, { text: "prompt" }),
    ).rejects.toMatchObject({ code: "STALE_OWNER" });
    expect({ writes, events }).toEqual({ writes: 0, events: [] });
  });
  it("rejects stale-owner stopped submit before factory creation", async () => {
    let creates = 0;
    let writes = 0;
    const { manager, store } = configured(
      {
        submit: async () => {
          writes++;
          return { kind: "accepted" };
        },
        cancel: async () => ({ kind: "accepted" }),
      },
      undefined,
      5000,
      true,
      () => {
        creates++;
      },
    );
    const row = await manager.create({ cwd: process.cwd() });
    await manager.stop(row.id);
    const before = creates;
    store.stale = true;
    await expect(
      manager.inputs.submit(row.id, { text: "prompt" }),
    ).rejects.toMatchObject({ code: "STALE_OWNER" });
    expect(creates).toBe(before);
    expect(writes).toBe(0);
    expect(manager.get(row.id).status).toBe("stopped");
  });
  it.each(["exact", "current"] as const)(
    "rejects stale-owner %s cancel without mutation",
    async (mode) => {
      let cancels = 0;
      const { manager, store } = configured({
        submit: async () => ({ kind: "accepted" }),
        cancel: async () => {
          cancels++;
          return { kind: "accepted" };
        },
      });
      const row = await manager.create({ cwd: process.cwd() });
      const input = await manager.inputs.submit(row.id, { text: "prompt" });
      const events: string[] = [];
      manager.inputs.subscribe((event) => events.push(event.state));
      store.stale = true;
      const cancel =
        mode === "exact"
          ? manager.inputs.cancel(row.id, input.inputId)
          : manager.inputs.cancelCurrent(row.id);
      await expect(cancel).rejects.toMatchObject({ code: "STALE_OWNER" });
      expect(cancels).toBe(0);
      expect(events).toEqual([]);
    },
  );
});
