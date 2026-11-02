import { describe, expect, it } from "vitest";
import { ClaudeTextInputController } from "../src/harness/claude-text-input-controller.js";
const session = "12345678-abcd-4abc-8abc-1234567890ab";
describe("Claude terminal result protocol", () => {
  it("does not complete a malformed success result without a result string", async () => {
    const controller = new ClaudeTextInputController();
    let writeDone!: () => void;
    controller.bind(session, (_record, callback) => {
      writeDone = () => callback();
    });
    controller.markReady();
    const events: unknown[] = [];
    controller.subscribe((event) => events.push(event));
    const pending = controller.submit({ inputId: "opaque", text: "exact" });
    writeDone();
    controller.onRecord(
      JSON.stringify({
        type: "user",
        session_id: session,
        isReplay: true,
        message: { role: "user", content: "exact" },
      }),
    );
    await expect(pending).resolves.toEqual({ kind: "accepted" });
    controller.onRecord(
      JSON.stringify({
        type: "result",
        session_id: session,
        subtype: "success",
        is_error: false,
      }),
    );
    expect(events).not.toContainEqual({
      inputId: "opaque",
      state: "completed",
    });
    expect(events.at(-1)).toEqual({ kind: "execution-ended" });
  });
});
