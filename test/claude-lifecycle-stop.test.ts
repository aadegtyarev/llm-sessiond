import { spawn } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ChildProcess } from "node:child_process";
import { ClaudeLifecycleAdapter } from "../src/harness/claude-lifecycle-adapter.js";
import { ClaudeLifecycleExecutionFactory } from "../src/harness/claude-lifecycle-factory.js";
import type { ProcessProvider } from "../src/core/ports.js";

const id = "12345678-abcd-4abc-8abc-1234567890ab";
describe("Claude child stop confirmation", () => {
  it("retains retryability after unconfirmed cleanup and coalesces concurrent stop", async () => {
    let child: ChildProcess | undefined;
    let attempts = 0;
    const provider: ProcessProvider = {
      launch: (_exe, args, cwd) =>
        (child = spawn(
          process.execPath,
          [path.resolve("test/fixtures/fake-claude-lifecycle.mjs"), ...args],
          {
            cwd,
            env: { ...process.env, CLAUDE_V2_MODE: "ok" },
            stdio: ["pipe", "pipe", "ignore"],
          },
        )),
    };
    const adapter = new ClaudeLifecycleAdapter();
    const execution = new ClaudeLifecycleExecutionFactory(
      adapter,
      provider,
      undefined,
      500,
      () => id,
      async () => {
        attempts++;
      },
    ).create(adapter);
    await execution.launch({ cwd: process.cwd() });
    await expect(execution.stop()).rejects.toThrow("CLAUDE_STOP_UNCONFIRMED");
    child!.kill("SIGTERM");
    await new Promise<void>((resolve) => child!.once("close", () => resolve()));
    await Promise.all([execution.stop(), execution.stop()]);
    expect(attempts).toBe(2);
    await execution.stop();
  });
});
