import { describe, expect, it } from "vitest";
import { configured } from "./durable-input-runtime-support.js";

const reasons = [
  "prompt_rejected",
  "hold_timeout",
  "held_and_stopped",
  "canceled",
] as const;
describe("definite input rejection", () => {
  it.each(reasons)(
    "returns safe rejection for running submit: %s",
    async (reason) => {
      let writes = 0;
      const { manager } = configured({
        submit: async () => {
          writes++;
          return { kind: "rejected", reason };
        },
        cancel: async () => ({ kind: "accepted" }),
      });
      const row = await manager.create({ cwd: process.cwd() });
      await expect(
        manager.inputs.submit(row.id, { text: "prompt" }),
      ).rejects.toMatchObject({
        code: "INPUT_REJECTED",
        inputId: "input.custom",
        resumed: false,
        failureReason: reason,
      });
      expect(writes).toBe(1);
    },
  );
  it.each(reasons)(
    "preserves resumed metadata after auto-resume rejection: %s",
    async (reason) => {
      let writes = 0;
      const { manager } = configured({
        submit: async () => {
          writes++;
          return { kind: "rejected", reason };
        },
        cancel: async () => ({ kind: "accepted" }),
      });
      const row = await manager.create({ cwd: process.cwd() });
      await manager.stop(row.id);
      await expect(
        manager.inputs.submit(row.id, { text: "prompt" }),
      ).rejects.toMatchObject({
        code: "INPUT_REJECTED",
        inputId: "input.custom",
        resumed: true,
        failureReason: reason,
      });
      expect(writes).toBe(1);
      expect(manager.get(row.id).status).toBe("running");
      await manager.stop(row.id);
    },
  );
});
