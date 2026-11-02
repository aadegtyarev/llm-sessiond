import { describe, expect, it } from "vitest";
import type { ProcessProvider } from "../src/core/ports.js";
import { PiDurableProcess } from "../src/harness/pi-durable-process.js";
import { FakePiChild } from "./pi-durable-fake-child.js";

function reply(
  child: FakePiChild,
  request: Record<string, unknown>,
  data: Record<string, unknown>,
) {
  child.send({
    type: "response",
    id: request.id,
    command: request.type,
    success: true,
    data,
  });
}
describe("Pi input and live-status RPC concurrency", () => {
  it("uses the same RPC reader without duplicating prompt writes", async () => {
    const child = new FakePiChild();
    let prompt: Record<string, unknown> | undefined;
    child.onWrite = (request) => {
      if (request.type === "get_state")
        reply(child, request, {
          sessionId: "native-test",
          model: { provider: "p", id: "m" },
        });
      else if (request.type === "get_session_stats")
        reply(child, request, { tokens: { total: 0 } });
      else if (request.type === "prompt") prompt = request;
    };
    const process = new PiDurableProcess(
      { launch: () => child.child } as ProcessProvider,
      "pi",
      100,
      async () => child.confirmExit(),
    );
    try {
      await process.start("/tmp", []);
      const input = process.inputs.submit({
        inputId: "input-1",
        text: "exact prompt",
      });
      await expect(process.readLiveStatus()).resolves.toEqual({
        model: { provider: "p", id: "m", name: "m" },
        usage: { totalTokens: 0 },
      });
      expect(
        child.writes.filter((request) => request.type === "prompt"),
      ).toHaveLength(1);
      expect(prompt).toMatchObject({ message: "exact prompt" });
      reply(child, prompt!, {});
      await expect(input).resolves.toEqual({ kind: "accepted" });
    } finally {
      await process.stop();
    }
  });
});
