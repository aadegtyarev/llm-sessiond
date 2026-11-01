import { describe, expect, it } from "vitest";
import { setup } from "./durable-manager-support.js";
describe("late timed-out stop", () => {
  it("does not persist stopped when the adapter settles after timeout", async () => {
    let settle!: () => void;
    let calls = 0;
    const late = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const { manager } = setup({
      stop: async () => {
        calls++;
        await late;
      },
      timeout: 5,
    });
    const row = await manager.create({ cwd: process.cwd() });
    await expect(manager.stop(row.id)).rejects.toMatchObject({
      code: "OPERATION_TIMEOUT",
    });
    expect(manager.get(row.id).status).toBe("uncertain");
    settle();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(manager.get(row.id).status).toBe("uncertain");
    expect(calls).toBe(1);
  });
});
