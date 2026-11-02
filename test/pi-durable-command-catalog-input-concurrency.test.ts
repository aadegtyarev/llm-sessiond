import { describe, expect, it } from "vitest";
import { answer, processFor } from "./pi-durable-model-catalog-support.js";
import { FakePiChild } from "./pi-durable-fake-child.js";

describe("Pi command inventory input concurrency", () => {
  it("shares the correlated reader without writing a duplicate prompt", async () => {
    const child = new FakePiChild();
    let prompt: Record<string, unknown> | undefined;
    child.onWrite = (request) => {
      if (request.type === "get_state")
        answer(child, request, { sessionId: "native-test" });
      else if (request.type === "get_commands")
        answer(child, request, { commands: [] });
      else if (request.type === "prompt") prompt = request;
    };
    const process = processFor(child);
    try {
      await process.start("/tmp", []);
      const input = process.inputs.submit({
        inputId: "input-1",
        text: "exact prompt",
      });
      await expect(process.readCommandCatalog()).resolves.toEqual({
        commands: [],
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
