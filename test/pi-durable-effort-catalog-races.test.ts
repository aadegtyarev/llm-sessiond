import { describe, expect, it } from "vitest";
import { answer, processFor } from "./pi-durable-model-catalog-support.js";
import { FakePiChild } from "./pi-durable-fake-child.js";

describe("Pi effort catalog RPC races", () => {
  it("rejects a same-turn terminal child after a resolved correlated reply", async () => {
    const child = new FakePiChild();
    child.onWrite = (request) => {
      answer(
        child,
        request,
        request.type === "get_state"
          ? { sessionId: "native-test" }
          : { levels: ["high"] },
      );
      if (request.type === "get_available_thinking_levels") child.confirmExit();
    };
    const process = processFor(child);
    try {
      await process.start("/tmp", []);
      await expect(process.readEffortCatalog()).rejects.toThrow(
        "RPC_UNAVAILABLE",
      );
    } finally {
      await process.stop();
    }
  });
  it("shares the RPC reader during active input without duplicating prompt", async () => {
    const child = new FakePiChild();
    let prompt: Record<string, unknown> | undefined;
    child.onWrite = (request) => {
      if (request.type === "get_state")
        answer(child, request, { sessionId: "native-test" });
      else if (request.type === "get_available_thinking_levels")
        answer(child, request, { levels: ["custom"] });
      else if (request.type === "prompt") prompt = request;
    };
    const process = processFor(child);
    try {
      await process.start("/tmp", []);
      const input = process.inputs.submit({
        inputId: "input-1",
        text: "exact",
      });
      await expect(process.readEffortCatalog()).resolves.toEqual({
        levels: ["custom"],
      });
      expect(
        child.writes.filter((request) => request.type === "prompt"),
      ).toHaveLength(1);
      answer(child, prompt!, {});
      await expect(input).resolves.toEqual({ kind: "accepted" });
    } finally {
      await process.stop();
    }
  });
});
