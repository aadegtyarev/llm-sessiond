import { describe, expect, it } from "vitest";
import {
  openPiEffort,
  piEffortContext,
} from "./pi-durable-effort-change-support.js";

describe("Pi effort change with active input", () => {
  it("keeps a refused write isolated and does not replay the active prompt", async () => {
    const { process, child } = await openPiEffort();
    try {
      await expect(
        process.inputs.submit({ inputId: "current", text: "held" }),
      ).resolves.toEqual({ kind: "accepted" });
      await expect(
        process.changeEffort("high", piEffortContext("native-test", false)),
      ).rejects.toThrow();
      await expect(
        process.changeEffort("high", piEffortContext()),
      ).resolves.toEqual({ outcome: "applied" });
      await expect(process.readEffortCatalog()).resolves.toEqual({
        levels: ["low", "high"],
      });
      expect(
        child.writes.filter((request) => request.type === "prompt"),
      ).toHaveLength(1);
      expect(
        child.writes.filter((request) => request.type === "set_thinking_level"),
      ).toHaveLength(1);
    } finally {
      await process.stop();
    }
  });
});
