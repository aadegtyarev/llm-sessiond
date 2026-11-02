import { describe, expect, it } from "vitest";
import {
  openPiEffort,
  piEffortContext,
} from "./pi-durable-effort-change-support.js";

describe("Pi durable effort change", () => {
  it("writes one setter and succeeds only after exact state readback", async () => {
    const { process, child } = await openPiEffort();
    try {
      await expect(
        process.changeEffort("high", piEffortContext()),
      ).resolves.toEqual({
        outcome: "applied",
      });
      const setters = child.writes.filter(
        (request) => request.type === "set_thinking_level",
      );
      expect(setters).toEqual([
        { type: "set_thinking_level", id: setters[0]!.id, level: "high" },
      ]);
      expect(
        child.writes.filter((request) => request.type === "get_state"),
      ).toHaveLength(3);
      expect(
        child.writes.filter(
          (request) => request.type === "get_available_thinking_levels",
        ),
      ).toHaveLength(1);
    } finally {
      await process.stop();
    }
  });
  it.each([
    [{ levels: ["low"] }, "high"],
    [{ stateId: "stale-native" }, "high"],
    [{}, " high "],
  ])(
    "rejects stale or unsupported exact state without setter",
    async (options, level) => {
      const { process, child } = await openPiEffort(options);
      try {
        await expect(
          process.changeEffort(level, piEffortContext()),
        ).rejects.toThrow();
        expect(
          child.writes.filter(
            (request) => request.type === "set_thinking_level",
          ),
        ).toHaveLength(0);
      } finally {
        await process.stop();
      }
    },
  );
  it.each([{ setterSuccess: false }, { applySetter: false }])(
    "does not claim application from setter ACK or readback mismatch",
    async (options) => {
      const { process, child } = await openPiEffort(options);
      try {
        await expect(
          process.changeEffort("high", piEffortContext()),
        ).rejects.toThrow();
        expect(
          child.writes.filter(
            (request) => request.type === "set_thinking_level",
          ),
        ).toHaveLength(1);
      } finally {
        await process.stop();
      }
    },
  );
  it("fails closed at a stale preflight fence without killing the shared link", async () => {
    const { process, child } = await openPiEffort();
    try {
      await expect(
        process.changeEffort("high", piEffortContext("native-test", false)),
      ).rejects.toThrow();
      expect(
        child.writes.filter((request) => request.type === "set_thinking_level"),
      ).toHaveLength(0);
      expect(process.inputs).toBeDefined();
    } finally {
      await process.stop();
    }
  });
});
