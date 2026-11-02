import { describe, expect, it } from "vitest";
import type { ProcessProvider } from "../src/core/ports.js";
import { PiDurableProcess } from "../src/harness/pi-durable-process.js";
import { FakePiChild } from "./pi-durable-fake-child.js";

describe("Pi durable live status RPC", () => {
  it("correlates both read-only requests on the existing RPC link", async () => {
    const child = new FakePiChild();
    child.onWrite = (request) => {
      const data =
        request.type === "get_state"
          ? {
              sessionId: "native-test",
              model: { provider: "p", id: "m", name: "M", secret: "no" },
              thinkingLevel: "high",
            }
          : { tokens: { total: 0, input: 4 }, contextUsage: { tokens: null } };
      child.send({
        type: "response",
        id: "wrong-private-id",
        command: request.type,
        success: true,
        data: { secret: "wrong reply" },
      });
      child.send({
        type: "response",
        id: request.id,
        command: request.type,
        success: true,
        data,
      });
    };
    const provider = { launch: () => child.child } as ProcessProvider;
    const process = new PiDurableProcess(provider, "pi", 100);
    await process.start("/tmp", []);
    await expect(process.readLiveStatus()).resolves.toEqual({
      model: { provider: "p", id: "m", name: "M" },
      effort: "high",
      usage: { totalTokens: 0, inputTokens: 4, contextTokens: null },
    });
    expect(child.writes.map((request) => request.type)).toEqual([
      "get_state",
      "get_state",
      "get_session_stats",
    ]);
    await process.stop();
  });
  it("rejects malformed native data without exposing it", async () => {
    const child = new FakePiChild();
    child.onWrite = (request) =>
      child.send({
        type: "response",
        id: request.id,
        command: request.type,
        success: true,
        data:
          request.type === "get_state"
            ? { sessionId: "native-test" }
            : { tokens: { total: -1, prompt: "secret" } },
      });
    const process = new PiDurableProcess(
      { launch: () => child.child } as ProcessProvider,
      "pi",
      100,
    );
    await process.start("/tmp", []);
    await expect(process.readLiveStatus()).rejects.toThrow(
      "INVALID_LIVE_STATUS",
    );
    await process.stop();
  });
});
