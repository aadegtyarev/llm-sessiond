import { describe, expect, it } from "vitest";
import { PiDurableInputPort } from "../src/harness/pi-durable-input-port.js";
import { FakePiChild } from "./pi-durable-fake-child.js";
import { PiDurableRpcLink } from "../src/harness/pi-durable-rpc-link.js";

describe("Pi exact durable cancellation", () => {
  it("rejects pending and wrong IDs before writing abort", async () => {
    const child = new FakePiChild();
    const port = new PiDurableInputPort();
    const link = new PiDurableRpcLink(child.child);
    port.attach(link);
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
      const pending = port.submit({ inputId: "exact", text: "text" });
      expect(await port.cancel("exact")).toEqual({ kind: "uncertain" });
      expect(await pending).toEqual({ kind: "accepted" });
      expect(await port.cancel("wrong")).toEqual({ kind: "uncertain" });
      port.end();
      expect(await port.cancel("exact")).toEqual({ kind: "uncertain" });
      expect(
        child.writes.filter((request) => request.type === "abort"),
      ).toEqual([]);
    } finally {
      link.dispose();
    }
  });

  it("waits for agent_settled after one accepted abort and rejects duplicates", async () => {
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
      await port.submit({ inputId: "exact", text: "text" });
      const cancel = port.cancel("exact");
      expect(await port.cancel("exact")).toEqual({ kind: "uncertain" });
      const abort = child.writes.find((request) => request.type === "abort");
      expect(abort).toEqual({ type: "abort", id: expect.any(String) });
      child.send({
        type: "response",
        id: abort!.id,
        command: "abort",
        success: true,
      });
      expect(await cancel).toEqual({ kind: "accepted" });
      child.send({ type: "agent_end" });
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(events).toEqual([]);
      child.send({ type: "agent_settled" });
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(events).toEqual([
        { inputId: "exact", state: "failed", reason: "canceled" },
      ]);
    } finally {
      link.dispose();
    }
  });
});
