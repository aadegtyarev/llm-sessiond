import { describe, expect, it } from "vitest";
import { PiDurableRpcLink } from "../src/harness/pi-durable-rpc-link.js";
import { FakePiChild } from "./pi-durable-fake-child.js";

describe("Pi durable RPC write boundary", () => {
  it("captures serialized arguments and writer before the final callback", async () => {
    const child = new FakePiChild();
    const originalWrite = child.stdin.write!;
    child.stdin.write = function (chunk, callback) {
      expect(this).toBe(child.stdin);
      return originalWrite.call(this, chunk, callback);
    };
    const link = new PiDurableRpcLink(child.child);
    let nested: ReturnType<typeof link.command> | undefined;
    child.onWrite = (request) => {
      if (request.type === "nested")
        child.send({
          type: "response",
          id: request.id,
          command: "nested",
          success: true,
        });
    };
    const order: string[] = [];
    const args = Object.defineProperty({}, "value", {
      enumerable: true,
      get: () => {
        order.push("getter");
        order.push("reentrant");
        nested = link.command("nested", {});
        child.stdin.write = () => {
          throw new Error("replacement writer must not run");
        };
        return "captured";
      },
    }) as Record<string, unknown>;
    const response = link.command("captured", args, 100, () => {
      order.push("fence");
      return true;
    });
    expect(order).toEqual(["getter", "reentrant", "fence"]);
    await expect(nested).resolves.toMatchObject({ success: true });
    const request = child.writes[1]!;
    expect(request).toMatchObject({ type: "captured", value: "captured" });
    child.send({
      type: "response",
      id: request.id,
      command: "captured",
      success: true,
    });
    await expect(response).resolves.toMatchObject({ success: true });
    link.dispose();
  });

  it("keeps an invoked writer failure uncertain even with a hook", async () => {
    const child = new FakePiChild();
    child.stdin.write = () => {
      throw new Error("native write failure");
    };
    const link = new PiDurableRpcLink(child.child);
    const request = link.command("write", {}, 100, () => true);
    await expect(request).rejects.toThrow("RPC_UNCERTAIN");
    expect(link.writable).toBe(false);
    expect(child.writes).toHaveLength(0);
    link.dispose();
  });
});
