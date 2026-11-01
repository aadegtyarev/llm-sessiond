import { describe, expect, it } from "vitest";
import { ClaudeLifecycleAdapter } from "../src/harness/claude-lifecycle-adapter.js";
import { ClaudeLifecycleExecutionFactory } from "../src/harness/claude-lifecycle-factory.js";

const sessionId = "12345678-abcd-4abc-8abc-1234567890ab";
describe("Claude lifecycle validation", () => {
  it("rejects unsupported options, malformed checkpoints, and identity mismatch before spawn", async () => {
    let launches = 0;
    const adapter = new ClaudeLifecycleAdapter();
    const execution = new ClaudeLifecycleExecutionFactory(
      adapter,
      {
        launch: () => {
          launches++;
          throw new Error("spawn");
        },
      },
      undefined,
      20,
      () => sessionId,
    ).create(adapter);
    await expect(
      execution.launch({ cwd: process.cwd(), options: {} }),
    ).rejects.toThrow("UNSUPPORTED_OPTIONS");
    await expect(
      execution.resume({
        cwd: process.cwd(),
        checkpoint: {
          namespace: "claude.session",
          version: 1,
          data: { sessionId },
        },
        nativeSessionId: "different",
      }),
    ).rejects.toThrow("SESSION_ID_MISMATCH");
    expect(adapter.validateCheckpoint({ sessionId: "not-a-uuid" })).toBe(false);
    expect(adapter.validateCheckpoint({ sessionId, prompt: "secret" })).toBe(
      false,
    );
    expect(
      adapter.isResumable({
        namespace: "claude.session",
        version: 2,
        data: { sessionId },
      }),
    ).toBe(false);
    expect(launches).toBe(0);
    await execution.stop();
  });
});
