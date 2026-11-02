import { describe, expect, it, vi } from "vitest";
import { PiDurableInputPort } from "../src/harness/pi-durable-input-port.js";
import { PiDurableRpcLink } from "../src/harness/pi-durable-rpc-link.js";
import { FakePiChild } from "./pi-durable-fake-child.js";

async function acceptedInput() {
  const child = new FakePiChild();
  const link = new PiDurableRpcLink(child.child);
  const port = new PiDurableInputPort();
  port.attach(link);
  const submitted = port.submit({ inputId: "daemon-id", text: "exact" });
  const prompt = child.writes.find((entry) => entry.type === "prompt")!;
  child.send({
    type: "response",
    id: prompt.id,
    command: "prompt",
    success: true,
  });
  expect(await submitted).toEqual({ kind: "accepted" });
  return { child, link, port };
}
describe("Pi durable terminal fences", () => {
  it("does not complete after duplicate settlement then terminal", async () => {
    const { child, link, port } = await acceptedInput();
    const events: unknown[] = [];
    port.subscribe((event) => events.push(event));
    let fakeTimers = false;
    try {
      vi.useFakeTimers();
      fakeTimers = true;
      child.send({ type: "agent_settled" });
      child.send({ type: "agent_settled" });
      expect(vi.getTimerCount()).toBe(1);
      child.stdout.emit("end");
      child.send({ type: "agent_settled" });
      await vi.runAllTimersAsync();
      expect(events).toEqual([{ kind: "execution-ended" }]);
      expect(link.writable).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      link.dispose();
      if (fakeTimers) vi.clearAllTimers();
      vi.useRealTimers();
    }
  });
  it("stops same-chunk dispatch after a bad correlated response", async () => {
    const child = new FakePiChild();
    const link = new PiDurableRpcLink(child.child);
    const port = new PiDurableInputPort();
    const events: unknown[] = [];
    port.attach(link);
    port.subscribe((event) => events.push(event));
    const submitted = port.submit({ inputId: "daemon-id", text: "exact" });
    const prompt = child.writes.find((entry) => entry.type === "prompt")!;
    child.stdout.emit(
      "data",
      `${JSON.stringify({ type: "response", id: prompt.id, command: "wrong", success: true })}\n${JSON.stringify({ type: "agent_settled" })}\n`,
    );
    expect(await submitted).toEqual({ kind: "uncertain" });
    expect(events).toEqual([{ kind: "execution-ended" }]);
    link.dispose();
  });
  it("treats malformed, oversized and stream errors as final", () => {
    for (const corrupt of [
      "{bad json}\n",
      `${JSON.stringify({ type: "notice", body: "x".repeat(1_048_577) })}\n`,
    ]) {
      const child = new FakePiChild();
      const link = new PiDurableRpcLink(child.child);
      let terminals = 0;
      link.on("terminal", () => terminals++);
      child.stdout.emit("data", corrupt);
      child.stdout.emit(
        "data",
        `${JSON.stringify({ type: "agent_settled" })}\n`,
      );
      expect(terminals).toBe(1);
      expect(link.writable).toBe(false);
      link.dispose();
    }
    for (const channel of ["stdin", "stdout", "child", "exit", "close"]) {
      const child = new FakePiChild();
      const link = new PiDurableRpcLink(child.child);
      let terminals = 0;
      link.on("terminal", () => terminals++);
      if (channel === "stdin") child.stdin.emit("error", new Error("epipe"));
      else if (channel === "stdout")
        child.stdout.emit("error", new Error("pipe"));
      else if (channel === "child") child.emit("error", new Error("child"));
      else if (channel === "exit") child.emit("exit", 1, null);
      else child.emit("close", 1, null);
      expect(terminals).toBe(1);
      link.dispose();
    }
  });
});
