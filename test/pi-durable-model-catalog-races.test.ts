import { describe, expect, it } from "vitest";
import { FakePiChild } from "./pi-durable-fake-child.js";
import { answer, processFor } from "./pi-durable-model-catalog-support.js";

describe("Pi model catalog RPC races", () => {
  it("rejects a reply when the child becomes terminal in the same turn", async () => {
    const child = new FakePiChild();
    let startup = true;
    child.onWrite = (request) => {
      answer(
        child,
        request,
        request.type === "get_state"
          ? { sessionId: "native-test" }
          : { models: [] },
      );
      if (request.type === "get_state") startup = false;
      if (request.type === "get_available_models" && !startup)
        child.confirmExit();
    };
    const process = processFor(child);
    try {
      await process.start("/tmp", []);
      await expect(process.readModelCatalog()).rejects.toThrow(
        "RPC_UNAVAILABLE",
      );
    } finally {
      await process.stop();
    }
  });
  it("shares the existing reader during active input without duplicate prompt writes", async () => {
    const child = new FakePiChild();
    let prompt: Record<string, unknown> | undefined;
    child.onWrite = (request) => {
      if (request.type === "get_state")
        answer(child, request, { sessionId: "native-test" });
      else if (request.type === "get_available_models")
        answer(child, request, {
          models: [{ provider: "p", id: "m", name: "M" }],
        });
      else if (request.type === "prompt") prompt = request;
    };
    const process = processFor(child);
    try {
      await process.start("/tmp", []);
      const input = process.inputs.submit({
        inputId: "input-1",
        text: "exact prompt",
      });
      await expect(process.readModelCatalog()).resolves.toEqual({
        models: [{ provider: "p", id: "m", name: "M" }],
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
