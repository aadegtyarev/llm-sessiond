import { describe, expect, it, vi } from "vitest";
import { PiDurableInputPort } from "../src/harness/pi-durable-input-port.js";
import { PiDurableRpcLink } from "../src/harness/pi-durable-rpc-link.js";
import { FakePiChild } from "./pi-durable-fake-child.js";

describe("Pi durable RPC write refusal", () => {
  it.each(["refuse", "throw"] as const)(
    "abandons only guarded RPC when hook %s",
    async (mode) => {
      vi.useFakeTimers();
      const child = new FakePiChild();
      child.onWrite = () => {};
      const link = new PiDurableRpcLink(child.child);
      const port = new PiDurableInputPort();
      port.attach(link);
      const events: unknown[] = [];
      port.subscribe((event) => events.push(event));
      const input = port.submit({ inputId: "input", text: "active" });
      const prompt = child.writes[0]!;
      const other = link.command("other", {}, 1_000);
      const denied = link.command("guarded", {}, 1_000, () => {
        if (mode === "throw") throw new Error("private guard detail");
        return false;
      });
      await expect(denied).rejects.toThrow("RPC_NOT_DISPATCHED");
      const next = link.command("next", {}, 1_000);
      expect(child.writes.map((request) => request.type)).toEqual([
        "prompt",
        "other",
        "next",
      ]);
      expect(vi.getTimerCount()).toBe(3);
      child.send({
        type: "response",
        id: prompt!.id,
        command: "prompt",
        success: true,
      });
      child.send({
        type: "response",
        id: child.writes[1]!.id,
        command: "other",
        success: true,
      });
      child.send({
        type: "response",
        id: child.writes[2]!.id,
        command: "next",
        success: true,
      });
      await expect(input).resolves.toEqual({ kind: "accepted" });
      await expect(other).resolves.toMatchObject({ success: true });
      await expect(next).resolves.toMatchObject({ success: true });
      child.send({
        type: "response",
        id: "abandoned",
        command: "guarded",
        success: true,
      });
      expect(link.writable).toBe(true);
      expect(events).toEqual([]);
      expect(vi.getTimerCount()).toBe(0);
      link.dispose();
      expect(vi.getTimerCount()).toBe(0);
      vi.useRealTimers();
    },
  );
});
