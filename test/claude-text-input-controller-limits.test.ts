import { describe, expect, it, vi } from "vitest";
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
describe("Claude text input admission fencing", () => {
  it("keeps uncertain delivery fenced after write error or timeout", async () => {
    const h = harness();
    const writeFailure = h.controller.submit({ inputId: "w", text: "write" });
    h.write(new Error("private"));
    await expect(writeFailure).resolves.toEqual({ kind: "uncertain" });
    expect(h.events.at(-1)).toEqual({ kind: "execution-ended" });
    h.controller.stopIntent();
    const timed = harness(5);
    vi.useFakeTimers();
    try {
      const timeout = timed.controller.submit({
        inputId: "t",
        text: "timeout",
      });
      await vi.advanceTimersByTimeAsync(6);
      await expect(timeout).resolves.toEqual({ kind: "uncertain" });
      expect(timed.events).toContainEqual({ inputId: "t", state: "uncertain" });
    } finally {
      vi.useRealTimers();
    }
  });
  it("closes synchronously during a gated ACK and ignores late callbacks", async () => {
    const h = harness();
    const pending = h.controller.submit({ inputId: "g", text: "gated" });
    h.controller.stopIntent();
    await expect(pending).resolves.toEqual({ kind: "uncertain" });
    h.write();
    h.controller.onRecord(
      JSON.stringify({
        type: "user",
        session_id: session,
        isReplay: true,
        message: { role: "user", content: "gated" },
      }),
    );
    await expect(
      h.controller.submit({ inputId: "late", text: "late" }),
    ).resolves.toEqual({ kind: "uncertain" });
  });
  it("fails closed on unsupported native control requests", async () => {
    const h = harness();
    const pending = h.controller.submit({ inputId: "p", text: "permission" });
    h.controller.onRecord(
      JSON.stringify({
        type: "control_request",
        session_id: session,
        request: { subtype: "can_use_tool" },
      }),
    );
    await expect(pending).resolves.toEqual({ kind: "uncertain" });
    expect(h.events.at(-1)).toEqual({ kind: "execution-ended" });
  });
  it("rejects images before writing and stop-before-start permanently closes admission", async () => {
    const h = harness();
    h.controller.stopIntent();
    h.controller.confirmStopped();
    await expect(
      h.controller.submit({ inputId: "i", text: "x", images: [] }),
    ).resolves.toEqual({ kind: "rejected", reason: "prompt_rejected" });
    await expect(
      h.controller.submit({ inputId: "x", text: "x" }),
    ).resolves.toEqual({ kind: "uncertain" });
    expect(h.wire()).toBe("");
  });
});
