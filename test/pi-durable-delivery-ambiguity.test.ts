import { describe, expect, it } from "vitest";
import { PiDurableInputPort } from "../src/harness/pi-durable-input-port.js";
import { PiDurableRpcLink } from "../src/harness/pi-durable-rpc-link.js";
import { FakePiChild } from "./pi-durable-fake-child.js";

describe("Pi durable delivery ambiguity", () => {
  it("classifies ACK timeout as uncertain and never replays", async () => {
    const child = new FakePiChild();
    const link = new PiDurableRpcLink(child.child);
    const command = link.command.bind(link);
    link.command = (name, args) => command(name, args, 10);
    const port = new PiDurableInputPort();
    const events: unknown[] = [];
    const records: unknown[] = [];
    link.on("event", (record) => records.push(record));
    port.attach(link);
    port.subscribe((event) => events.push(event));
    expect(await port.submit({ inputId: "daemon-id", text: "exact" })).toEqual({
      kind: "uncertain",
    });
    expect(
      child.writes.filter((entry) => entry.type === "prompt"),
    ).toHaveLength(1);
    expect(link.writable).toBe(true);
    child.send({ type: "agent_settled" });
    expect(records).toEqual([{ type: "agent_settled" }]);
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    expect(events).toEqual([{ inputId: "daemon-id", state: "completed" }]);
    expect(
      child.writes.filter((entry) => entry.type === "prompt"),
    ).toHaveLength(1);
    link.dispose();
  });
  it("classifies write failure as uncertain and never replays", async () => {
    const child = new FakePiChild();
    const originalWrite = child.stdin.write!;
    child.stdin.write = (chunk, callback) => {
      const result = originalWrite(chunk, callback);
      if ((JSON.parse(chunk) as { type: string }).type === "prompt")
        child.stdin.emit("error", new Error("EPIPE"));
      return result;
    };
    const link = new PiDurableRpcLink(child.child);
    const port = new PiDurableInputPort();
    const events: unknown[] = [];
    port.attach(link);
    port.subscribe((event) => events.push(event));
    expect(await port.submit({ inputId: "daemon-id", text: "exact" })).toEqual({
      kind: "uncertain",
    });
    expect(events).toEqual([{ kind: "execution-ended" }]);
    expect(
      await port.submit({ inputId: "next", text: "never replay" }),
    ).toEqual({ kind: "uncertain" });
    expect(
      child.writes.filter((entry) => entry.type === "prompt"),
    ).toHaveLength(1);
    link.dispose();
  });
});
