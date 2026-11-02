import { describe, expect, it, vi } from "vitest";
import { openNative } from "./pi-durable-effort-change-manager-support.js";

describe("Pi effort change manager integration", () => {
  it("returns applied only after a single setter and verified readback", async () => {
    const { child, runtime, session } = await openNative();
    try {
      await expect(
        runtime.manager.changeEffort(session.id, "high"),
      ).resolves.toEqual({ outcome: "applied" });
      expect(
        child.writes.filter((request) => request.type === "set_thinking_level"),
      ).toHaveLength(1);
    } finally {
      await runtime.shutdown();
    }
  });
  it("rejects unsupported exact levels without a mutating request", async () => {
    const { child, runtime, session } = await openNative({ levels: ["low"] });
    try {
      await expect(
        runtime.manager.changeEffort(session.id, " high "),
      ).rejects.toMatchObject({
        code: "OPERATION_FAILED",
        outcome: "not-applied",
      });
      expect(
        child.writes.filter((request) => request.type === "set_thinking_level"),
      ).toHaveLength(0);
    } finally {
      await runtime.shutdown();
    }
  });
  it.each([
    { setter: "false" },
    { setter: "malformed" },
    { setter: "write-error" },
    { setter: "exit" },
    { apply: false },
    { wrongReadbackId: true },
  ] as const)("reports unknown after possible mutation: %s", async (mode) => {
    const { child, runtime, session } = await openNative(mode);
    try {
      const failure = await runtime.manager
        .changeEffort(session.id, "high")
        .catch((error: unknown) => error);
      expect(failure).toMatchObject({ outcome: "unknown" });
      expect((failure as Error).message).toBe("lifecycle operation failed");
      expect(
        child.writes.filter((request) => request.type === "set_thinking_level"),
      ).toHaveLength(1);
    } finally {
      await runtime.shutdown();
    }
  });
  it("reports a setter ACK timeout as unknown without replay", async () => {
    vi.useFakeTimers();
    const { child, runtime, session } = await openNative({ setter: "timeout" });
    try {
      const operation = runtime.manager.changeEffort(session.id, "high");
      const rejection = expect(operation).rejects.toMatchObject({
        outcome: "unknown",
      });
      for (let turn = 0; turn < 6; turn += 1) await Promise.resolve();
      expect(
        child.writes.filter((request) => request.type === "set_thinking_level"),
      ).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(15_000);
      await rejection;
      expect(
        child.writes.filter((request) => request.type === "set_thinking_level"),
      ).toHaveLength(1);
    } finally {
      vi.useRealTimers();
      await runtime.shutdown();
    }
  });
});
