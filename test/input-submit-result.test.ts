import { describe, expect, it } from "vitest";
import type { InputOperation } from "../src/core/durable-input-state.js";
import type { ExecutionInputSource } from "../src/core/execution-input-source.js";
import { inputSubmitResult } from "../src/core/input-submit-result.js";
function operation(): InputOperation {
  return {
    id: "opaque",
    sessionId: "session",
    execution: {} as InputOperation["execution"],
    source: { live: true } as ExecutionInputSource,
    state: "accepted",
    resumed: true,
    terminal: "failed",
    stopInvalidated: false,
    executionEnded: false,
  };
}
describe("input submit result classification", () => {
  it("preserves accepted post-acceptance failure as a successful submit", () => {
    expect(inputSubmitResult(operation(), { kind: "accepted" })).toEqual({
      inputId: "opaque",
      resumed: true,
    });
    const rejected = operation();
    rejected.failureReason = "prompt_rejected";
    expect(() => inputSubmitResult(rejected, { kind: "accepted" })).toThrow(
      expect.objectContaining({ code: "INPUT_REJECTED" }),
    );
  });
  it("keeps definite command rejection and uncertain invalidation distinct", () => {
    expect(() =>
      inputSubmitResult(operation(), {
        kind: "rejected",
        reason: "prompt_rejected",
      }),
    ).toThrow(expect.objectContaining({ code: "INPUT_REJECTED" }));
    expect(() => inputSubmitResult(operation(), { kind: "uncertain" })).toThrow(
      expect.objectContaining({ code: "INPUT_UNCERTAIN" }),
    );
    const stopped = operation();
    stopped.stopInvalidated = true;
    expect(() => inputSubmitResult(stopped, { kind: "accepted" })).toThrow(
      expect.objectContaining({ code: "INPUT_UNCERTAIN" }),
    );
    const ended = operation();
    ended.source.live = false;
    expect(() => inputSubmitResult(ended, { kind: "accepted" })).toThrow(
      expect.objectContaining({ code: "INPUT_UNCERTAIN" }),
    );
  });
});
