import { describe, expect, it } from "vitest";
import type { EffortChangeCallContext } from "../src/core/effort-change-port.js";
import { PiDurableProcess } from "../src/harness/pi-durable-process.js";
import { FakePiChild } from "./pi-durable-fake-child.js";

describe("Pi effort change late preflight", () => {
  it("cannot dispatch a setter after catalog work completes beyond its lifetime", async () => {
    const child = new FakePiChild();
    child.onWrite = (request) => {
      if (request.type === "get_state")
        child.send({
          type: "response",
          id: request.id,
          command: request.type,
          success: true,
          data: { sessionId: "native-test", thinkingLevel: "low" },
        });
    };
    const durable = new PiDurableProcess(
      { launch: () => child.child },
      "fake-pi",
      1_000,
    );
    await durable.start(process.cwd(), []);
    let active = true;
    const context: EffortChangeCallContext = {
      expectedNativeSessionId: "native-test",
      isCurrent: () => active,
      remainingMs: () => (active ? 30_000 : 0),
      beforeMutationWrite: () => active,
    };
    try {
      const operation = durable.changeEffort("high", context);
      const rejection = expect(operation).rejects.toThrow();
      const catalog = child.writes.find(
        (request) => request.type === "get_available_thinking_levels",
      )!;
      active = false;
      child.send({
        type: "response",
        id: catalog.id,
        command: "get_available_thinking_levels",
        success: true,
        data: { levels: ["low", "high"] },
      });
      await rejection;
      expect(
        child.writes.filter((request) => request.type === "set_thinking_level"),
      ).toHaveLength(0);
      expect(child.stdin.writable).toBe(true);
    } finally {
      await durable.stop();
    }
  });
});
