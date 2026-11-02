import { describe, expect, it } from "vitest";
import { PiDurableInputPort } from "../src/harness/pi-durable-input-port.js";
import { PiDurableRpcLink } from "../src/harness/pi-durable-rpc-link.js";
import { FakePiChild } from "./pi-durable-fake-child.js";

describe("Pi abort uncertainty", () => {
  it("never repeats an abort after acknowledgement timeout", async () => {
    const child = new FakePiChild();
    const link = new PiDurableRpcLink(child.child);
    const command = link.command.bind(link);
    link.command = (name, args) => command(name, args, 10);
    const port = new PiDurableInputPort();
    port.attach(link);
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
      await port.submit({ inputId: "exact", text: "text" });
      expect(await port.cancel("exact")).toEqual({ kind: "uncertain" });
      expect(await port.cancel("exact")).toEqual({ kind: "uncertain" });
      expect(
        child.writes.filter((request) => request.type === "abort"),
      ).toHaveLength(1);
    } finally {
      link.dispose();
    }
  });

  it("classifies abort write failure as uncertain without replay", async () => {
    const child = new FakePiChild();
    const write = child.stdin.write!;
    child.stdin.write = (chunk, callback) => {
      const result = write(chunk, callback);
      if ((JSON.parse(chunk) as { type: string }).type === "abort")
        child.stdin.emit("error", new Error("EPIPE"));
      return result;
    };
    const link = new PiDurableRpcLink(child.child);
    const port = new PiDurableInputPort();
    port.attach(link);
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
      await port.submit({ inputId: "exact", text: "text" });
      expect(await port.cancel("exact")).toEqual({ kind: "uncertain" });
      expect(
        child.writes.filter((request) => request.type === "abort"),
      ).toHaveLength(1);
    } finally {
      link.dispose();
    }
  });
});
