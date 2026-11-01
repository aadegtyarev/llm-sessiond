import { describe, expect, it } from "vitest";
import { initializeClaude } from "../src/harness/claude-lifecycle-startup.js";
import { fakeChild } from "./claude-startup-fake-child.js";

const sessionId = "12345678-abcd-4abc-8abc-1234567890ab";
describe("Claude startup stream errors", () => {
  it("safely handles callback plus EPIPE and independent stdin errors until close", async () => {
    for (const mode of ["callback-and-error", "stdin-error"]) {
      const child = fakeChild(mode);
      await expect(initializeClaude(child, sessionId, 100)).rejects.toThrow(
        "CLAUDE_STARTUP_FAILED",
      );
      expect(child.stdin!.listenerCount("error")).toBeGreaterThan(0);
      child.emit("close");
      expect(child.stdin!.listenerCount("error")).toBe(0);
    }
  });
  it("rejects early stdout and child errors with safe failures", async () => {
    for (const mode of ["stdout-error", "child-error"]) {
      const child = fakeChild(mode);
      await expect(initializeClaude(child, sessionId, 100)).rejects.toThrow(
        "CLAUDE_STARTUP_FAILED",
      );
      child.emit("close");
    }
  });
});
