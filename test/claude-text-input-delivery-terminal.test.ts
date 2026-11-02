import { describe, expect, it } from "vitest";
import { ClaudeTextInputDelivery } from "../src/harness/claude-text-input-delivery.js";
const session = "12345678-abcd-4abc-8abc-1234567890ab";
describe("Claude terminal delivery fence", () => {
  it("ignores a terminal delivery's late callback and records after a new delivery starts", async () => {
    const first = delivery();
    const pending = first.input.start();
    first.input.record(replay("same"));
    first.write();
    await expect(pending).resolves.toEqual({ kind: "accepted" });
    first.input.record(result());
    const second = delivery();
    const next = second.input.start();
    first.input.record(replay("same"));
    first.write();
    expect(first.events).toEqual(["accepted", "completed"]);
    expect(second.events).toEqual([]);
    second.input.terminal();
    await expect(next).resolves.toEqual({ kind: "uncertain" });
  });
});
function delivery() {
  const events: string[] = [];
  let callback: ((error?: Error | null) => void) | undefined;
  const input = new ClaudeTextInputDelivery(
    "local",
    "same",
    session,
    (_wire, done) => {
      callback = done;
    },
    50,
    (event) => events.push((event as { state: string }).state),
    () => {},
    () => {},
  );
  return { input, events, write: () => callback?.() };
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
function result(): string {
  return JSON.stringify({
    type: "result",
    session_id: session,
    subtype: "success",
    is_error: false,
    result: "ok",
  });
}
