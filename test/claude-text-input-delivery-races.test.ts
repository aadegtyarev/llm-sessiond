import { describe, expect, it, vi } from "vitest";
import { ClaudeTextInputController } from "../src/harness/claude-text-input-controller.js";
const session = "12345678-abcd-4abc-8abc-1234567890ab";
describe("Claude delivery race fences", () => {
  it.each([true, false])(
    "fences late %s results after ACK deadline",
    async (success) => {
      vi.useFakeTimers();
      try {
        const h = controllerHarness(10);
        const pending = h.controller.submit({ inputId: "old", text: "same" });
        h.write();
        await vi.advanceTimersByTimeAsync(10);
        await expect(pending).resolves.toEqual({ kind: "uncertain" });
        h.controller.onRecord(replay("same"));
        h.controller.onRecord(result(success));
        await expect(
          h.controller.submit({ inputId: "next", text: "same" }),
        ).resolves.toEqual({ kind: "uncertain" });
        expect(h.writes).toBe(1);
        expect(h.events).toEqual([{ inputId: "old", state: "uncertain" }]);
      } finally {
        vi.useRealTimers();
      }
    },
  );
  it.each(["stop", "terminate"])(
    "fences buffered settlement after accepted observer %s",
    async (action) => {
      const h = controllerHarness();
      h.controller.subscribe((event) => {
        if ((event as { state?: string }).state !== "accepted") return;
        if (action === "stop") h.controller.stopIntent();
        else h.controller.terminate();
      });
      const pending = h.controller.submit({ inputId: "id", text: "same" });
      h.controller.onRecord(replay("same"));
      h.controller.onRecord(result(false));
      h.write();
      await expect(pending).resolves.toEqual({ kind: "accepted" });
      expect(h.events).not.toContainEqual({ inputId: "id", state: "failed" });
      expect(h.events).not.toContainEqual({
        inputId: "id",
        state: "completed",
      });
    },
  );
  it("keeps repeated stop intent idempotent", async () => {
    const h = controllerHarness();
    const pending = h.controller.submit({ inputId: "id", text: "same" });
    h.write();
    h.controller.onRecord(replay("same"));
    await expect(pending).resolves.toEqual({ kind: "accepted" });
    h.controller.stopIntent();
    h.controller.stopIntent();
    expect(h.events).toEqual([
      { inputId: "id", state: "accepted" },
      { inputId: "id", state: "uncertain" },
    ]);
  });
});
function controllerHarness(timeout = 50) {
  const controller = new ClaudeTextInputController(timeout);
  const callbacks: Array<(error?: Error | null) => void> = [];
  let writes = 0;
  controller.bind(session, (_wire, callback) => {
    writes++;
    callbacks.push(callback);
  });
  controller.markReady();
  const events: unknown[] = [];
  controller.subscribe((event) => events.push(event));
  return {
    controller,
    events,
    get writes() {
      return writes;
    },
    write: () => callbacks.at(-1)?.(),
  };
}
function replay(text: string): string {
  return JSON.stringify({
    type: "user",
    isReplay: true,
    session_id: session,
    parent_tool_use_id: null,
    message: { role: "user", content: text },
  });
}
function result(success: boolean): string {
  return JSON.stringify({
    type: "result",
    session_id: session,
    parent_tool_use_id: null,
    subtype: success ? "success" : "error",
    is_error: !success,
    ...(success ? { result: "ok" } : {}),
  });
}
