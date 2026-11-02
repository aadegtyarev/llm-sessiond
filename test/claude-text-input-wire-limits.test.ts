import { describe, expect, it } from "vitest";
import { ClaudeTextInputController } from "../src/harness/claude-text-input-controller.js";
const session = "12345678-abcd-4abc-8abc-1234567890ab";
function harness() {
  const controller = new ClaudeTextInputController();
  let wire = "";
  let complete: ((error?: Error | null) => void) | undefined;
  controller.bind(session, (record, callback) => {
    wire = record;
    complete = callback;
  });
  controller.markReady();
  return {
    controller,
    wire: () => wire,
    writeError: () => complete?.(new Error("private")),
  };
}
describe("Claude native wire record limit", () => {
  it("uses exact serialized bytes and rejects before writing without truncation", async () => {
    const ascii = harness();
    const pending = ascii.controller.submit({
      inputId: "ascii",
      text: "a".repeat(200_000),
    });
    expect(Buffer.byteLength(ascii.wire())).toBeLessThan(1024 * 1024);
    ascii.writeError();
    await expect(pending).resolves.toEqual({ kind: "uncertain" });
    const escaped = harness();
    await expect(
      escaped.controller.submit({
        inputId: "escaped",
        text: "\0".repeat(200_000),
      }),
    ).resolves.toEqual({ kind: "rejected", reason: "prompt_rejected" });
    expect(escaped.wire()).toBe("");
  });
});
