import { describe, expect, it } from "vitest";
import { ClaudeTextInputController } from "../src/harness/claude-text-input-controller.js";
const session = "12345678-abcd-4abc-8abc-1234567890ab";
function harness(timeout = 50) {
  const controller = new ClaudeTextInputController(timeout);
  let wire = "";
  let complete: ((error?: Error | null) => void) | undefined;
  controller.bind(session, (record, callback) => {
    wire = record;
    complete = callback;
  });
  controller.markReady();
  const events: unknown[] = [];
  controller.subscribe((event) => events.push(event));
  return {
    controller,
    events,
    wire: () => wire,
    write: (error?: Error | null) => complete?.(error),
  };
}
describe("Claude text input controller", () => {
  it("requires exact root replay and write completion before accepted", async () => {
    const h = harness();
    const submitted = h.controller.submit({
      inputId: "Opaque.ID-1",
      text: "a\\nb",
    });
    expect(h.wire()).toBe(
      `${JSON.stringify({ type: "user", message: { role: "user", content: "a\\nb" } })}\n`,
    );
    h.controller.onRecord(replay("a\\nb"));
    expect(h.events).toEqual([]);
    h.write();
    await expect(submitted).resolves.toEqual({ kind: "accepted" });
    expect(h.events).toEqual([{ inputId: "Opaque.ID-1", state: "accepted" }]);
    h.controller.onRecord(replay("a\\nb"));
    expect(h.events).toEqual([{ inputId: "Opaque.ID-1", state: "accepted" }]);
    h.controller.onRecord(result(true));
    expect(h.events.at(-1)).toEqual({
      inputId: "Opaque.ID-1",
      state: "completed",
    });
    const next = h.controller.submit({ inputId: "Opaque.ID-2", text: "a\\nb" });
    h.controller.onRecord(result(true));
    await expect(next).resolves.toEqual({ kind: "uncertain" });
  });
  it("ignores nested or wrong-content replays and fails closed on identity mismatch", async () => {
    const h = harness();
    const submitted = h.controller.submit({ inputId: "local", text: "same" });
    h.write();
    h.controller.onRecord(replay("same", { parent_tool_use_id: "tool" }));
    h.controller.onRecord(replay("other"));
    expect(h.events).toEqual([]);
    h.controller.onRecord(
      JSON.stringify({ type: "user", session_id: "wrong" }),
    );
    await expect(submitted).resolves.toEqual({ kind: "uncertain" });
    expect(h.events.at(-1)).toEqual({ kind: "execution-ended" });
  });
  it("reports accepted root failure without fabricating a reason; pre-ACK result is uncertain", async () => {
    const h = harness();
    const submitted = h.controller.submit({ inputId: "x", text: "fail" });
    h.write();
    h.controller.onRecord(replay("fail"));
    await submitted;
    h.controller.onRecord(result(false));
    expect(h.events.at(-1)).toEqual({ inputId: "x", state: "failed" });
    const early = harness();
    const unknown = early.controller.submit({ inputId: "y", text: "early" });
    early.controller.onRecord(result(true));
    await expect(unknown).resolves.toEqual({ kind: "uncertain" });
  });
});

function replay(text: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: "user",
    isReplay: true,
    session_id: session,
    parent_tool_use_id: null,
    message: { role: "user", content: text },
    ...extra,
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
