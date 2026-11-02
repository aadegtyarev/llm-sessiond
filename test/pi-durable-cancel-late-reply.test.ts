import { describe, expect, it } from "vitest";
import { PiDurableInputPort } from "../src/harness/pi-durable-input-port.js";
import { PiDurableRpcLink } from "../src/harness/pi-durable-rpc-link.js";
import { FakePiChild } from "./pi-durable-fake-child.js";

describe("late Pi abort replies", () => {
  it("cannot affect a replacement input after live settlement", async () => {
    const child = new FakePiChild();
    const link = new PiDurableRpcLink(child.child);
    const command = link.command.bind(link);
    link.command = (name, args) => command(name, args, 10);
    const port = new PiDurableInputPort();
    const events: unknown[] = [];
    port.attach(link);
    port.subscribe((event) => events.push(event));
    child.onWrite = (request) => {
      if (request.type === "prompt")
        child.send({
          type: "response",
          id: request.id,
          command: "prompt",
          success: true,
        });
    };
    try {
      await port.submit({ inputId: "old", text: "first" });
      expect(await port.cancel("old")).toEqual({ kind: "uncertain" });
      const abort = child.writes.find((request) => request.type === "abort");
      child.send({ type: "agent_settled" });
      await new Promise((resolve) => setTimeout(resolve, 5));
      await port.submit({ inputId: "new", text: "second" });
      child.send({
        type: "response",
        id: abort!.id,
        command: "abort",
        success: true,
      });
      expect(events).toEqual([{ inputId: "old", state: "completed" }]);
      expect(
        child.writes.filter((request) => request.type === "abort"),
      ).toHaveLength(1);
    } finally {
      link.dispose();
    }
  });
});
