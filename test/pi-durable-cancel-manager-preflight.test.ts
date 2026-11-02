import { describe, expect, it, vi } from "vitest";
import type { ProcessProvider } from "../src/core/ports.js";
import { createPiTestManager } from "./pi-durable-manager-support.js";
import { FakePiChild } from "./pi-durable-fake-child.js";

describe("manager settlement-before-cancel fence", () => {
  it.each(["exact", "current"] as const)(
    "rejects %s cancellation without abort write",
    async (target) => {
      vi.useFakeTimers();
      const child = new FakePiChild();
      const provider: ProcessProvider = { launch: () => child.child };
      const manager = createPiTestManager(
        provider,
        (() => {
          let id = 0;
          return () => `id-${++id}`;
        })(),
        1000,
      );
      const events: Array<{ inputId: string; state: string; reason?: string }> =
        [];
      child.onWrite = (request) => {
        if (request.type === "get_state")
          child.send({
            type: "response",
            id: request.id,
            command: "get_state",
            success: true,
            data: { sessionId: "native-test" },
          });
        if (request.type === "prompt") {
          child.send({
            type: "response",
            id: request.id,
            command: "prompt",
            success: true,
          });
          child.send({ type: "agent_settled" });
        }
      };
      try {
        const session = await manager.create({ cwd: process.cwd() });
        manager.inputs.subscribe((event) => {
          if ("inputId" in event) events.push(event);
        });
        const input = await manager.inputs.submit(session.id, {
          text: "settled",
        });
        expect(vi.getTimerCount()).toBeGreaterThan(0);
        const cancel =
          target === "exact"
            ? manager.inputs.cancel(session.id, input.inputId)
            : manager.inputs.cancelCurrent(session.id);
        await expect(cancel).rejects.toMatchObject({
          code: "OPERATION_FAILED",
        });
        expect(
          child.writes.filter((request) => request.type === "abort"),
        ).toHaveLength(0);
        expect(
          events.filter((event) =>
            ["completed", "failed"].includes(event.state),
          ),
        ).toEqual([]);
        await vi.runAllTimersAsync();
        expect(
          events.filter((event) =>
            ["completed", "failed"].includes(event.state),
          ),
        ).toEqual([
          { sessionId: session.id, inputId: input.inputId, state: "completed" },
        ]);
        expect(
          child.writes.filter((request) => request.type === "abort"),
        ).toHaveLength(0);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.clearAllTimers();
        vi.useRealTimers();
        await manager.shutdownOwned();
      }
    },
  );
});
