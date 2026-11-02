import { describe, expect, it, vi } from "vitest";
import { PiDurableInputPort } from "../src/harness/pi-durable-input-port.js";
import { PiDurableRpcLink } from "../src/harness/pi-durable-rpc-link.js";
import { FakePiChild } from "./pi-durable-fake-child.js";

describe("Pi cancellation preflight fences", () => {
  it("does not resend after abort ACK and preserves canceled settlement", async () => {
    vi.useFakeTimers();
    const child = new FakePiChild();
    const link = new PiDurableRpcLink(child.child);
    const port = new PiDurableInputPort();
    const events: unknown[] = [];
    port.attach(link);
    port.subscribe((event) => events.push(event));
    try {
      child.onWrite = (request) => {
        if (request.type === "prompt")
          child.send({
            type: "response",
            id: request.id,
            command: "prompt",
            success: true,
          });
      };
      await port.submit({ inputId: "exact", text: "held" });
      const first = port.cancel("exact");
      const abort = child.writes.find((request) => request.type === "abort");
      child.send({
        type: "response",
        id: abort!.id,
        command: "abort",
        success: true,
      });
      expect(await first).toEqual({ kind: "accepted" });
      expect(await port.cancel("exact")).toEqual({ kind: "accepted" });
      expect(
        child.writes.filter((request) => request.type === "abort"),
      ).toHaveLength(1);
      child.send({ type: "agent_settled" });
      await vi.runAllTimersAsync();
      expect(events).toEqual([
        { inputId: "exact", state: "failed", reason: "canceled" },
      ]);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      link.dispose();
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("rejects cancellation after settlement was observed but before timer flush", async () => {
    vi.useFakeTimers();
    const child = new FakePiChild();
    const link = new PiDurableRpcLink(child.child);
    const port = new PiDurableInputPort();
    const events: unknown[] = [];
    port.attach(link);
    port.subscribe((event) => events.push(event));
    try {
      child.onWrite = (request) => {
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
      await port.submit({ inputId: "exact", text: "settled" });
      expect(vi.getTimerCount()).toBe(1);
      await expect(port.cancel("exact")).resolves.toEqual({ kind: "rejected" });
      expect(
        child.writes.filter((request) => request.type === "abort"),
      ).toHaveLength(0);
      expect(events).toEqual([]);
      child.send({
        type: "response",
        id: "unissued",
        command: "abort",
        success: true,
      });
      await vi.runAllTimersAsync();
      expect(events).toEqual([{ inputId: "exact", state: "completed" }]);
      await expect(port.cancel("exact")).resolves.toEqual({
        kind: "uncertain",
      });
      expect(
        child.writes.filter((request) => request.type === "abort"),
      ).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      link.dispose();
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });
});
