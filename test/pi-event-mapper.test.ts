import { afterEach, describe, expect, it } from "vitest";
import { cleanup, provider, tempDir } from "./helpers.js";
import { EventBus } from "../src/core/event-bus.js";
import { startPiProcess } from "../src/harness/pi-startup.js";

afterEach(cleanup);
describe("Pi event mapping", () => {
  it("validates tool activity and omits raw results", async () => {
    const pi = await startPiProcess(
      provider.launch("fake", ["--mode", "rpc"], await tempDir()),
    );
    const bus = new EventBus();
    const events: Record<string, unknown>[] = [];
    bus.on("event", (item) => events.push(item));
    pi.onEvent((type, data) =>
      bus.publish("00000000-0000-4000-8000-000000000001", type, data),
    );
    const start = new Promise<void>((resolve) =>
      bus.on("event", (item) => {
        if (item.type === "activity" && item.data.type === "tool_start")
          resolve();
      }),
    );
    const end = new Promise<void>((resolve) =>
      bus.on("event", (item) => {
        if (item.type === "activity" && item.data.type === "tool_end")
          resolve();
      }),
    );
    try {
      await pi.submit("tool");
      await Promise.all([start, end]);
      expect(events.map((event) => event.data)).toContainEqual({
        type: "tool_start",
        toolCallId: "tool-1",
        toolName: "bash",
      });
      expect(events.map((event) => event.data)).toContainEqual({
        type: "tool_end",
        toolCallId: "tool-1",
        toolName: "bash",
        failed: true,
      });
      expect(JSON.stringify(events)).not.toContain("private");
    } finally {
      await pi.stop();
    }
  });
});
