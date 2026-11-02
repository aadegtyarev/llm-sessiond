import { describe, expect, it, vi } from "vitest";
import type { ProcessProvider } from "../src/core/ports.js";
import { PiDurableProcess } from "../src/harness/pi-durable-process.js";
import { FakePiChild } from "./pi-durable-fake-child.js";

const create = (child: FakePiChild) =>
  new PiDurableProcess(
    { launch: () => child.child } as ProcessProvider,
    "pi",
    100,
    async () => child.confirmExit(),
  );
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
describe("Pi live status races", () => {
  it("ignores a late correlated reply after request timeout", async () => {
    vi.useFakeTimers();
    const child = new FakePiChild();
    const reads: Record<string, unknown>[] = [];
    let startup = true;
    child.onWrite = (request) => {
      if (request.type === "get_state" && startup) {
        startup = false;
        reply(child, request, { sessionId: "native-test" });
        return;
      }
      if (request.type === "get_state" || request.type === "get_session_stats")
        reads.push(request);
      if (reads.length > 2)
        reply(
          child,
          request,
          request.type === "get_state" ? { sessionId: "native-test" } : {},
        );
    };
    const process = create(child);
    try {
      await process.start("/tmp", []);
      const timed = process.readLiveStatus();
      const rejected = expect(timed).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(15_001);
      await rejected;
      for (const request of reads.slice(0, 2)) reply(child, request, {});
      const fresh = process.readLiveStatus();
      await expect(fresh).resolves.toEqual({});
    } finally {
      await process.stop();
      vi.useRealTimers();
    }
  });
  it("rejects a mismatched native session identity", async () => {
    const child = new FakePiChild();
    let states = 0;
    child.onWrite = (request) => {
      if (request.type === "get_state") {
        states++;
        reply(child, request, {
          sessionId: states === 1 ? "native-test" : "other",
        });
      } else reply(child, request, {});
    };
    const process = create(child);
    try {
      await process.start("/tmp", []);
      await expect(process.readLiveStatus()).rejects.toThrow(
        "INVALID_LIVE_STATUS",
      );
    } finally {
      await process.stop();
    }
  });
});
