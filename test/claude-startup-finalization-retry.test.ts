import { spawn } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ChildProcess } from "node:child_process";
import type { ProcessProvider } from "../src/core/ports.js";
import { ClaudeLifecycleAdapter } from "../src/harness/claude-lifecycle-adapter.js";
import { ClaudeLifecycleExecutionFactory } from "../src/harness/claude-lifecycle-factory.js";
import { createDurableRuntime } from "../src/harness/durable-runtime.js";
import { MemoryStore } from "./durable-memory-store.js";

const id = "12345678-abcd-4abc-8abc-1234567890ab";
describe("Claude startup finalizer retry", () => {
  it("retries startup cleanup after the first termination attempt rejects", async () => {
    let child: ChildProcess | undefined;
    let attempts = 0;
    const provider: ProcessProvider = {
      launch: (_exe, args, cwd) =>
        (child = spawn(
          process.execPath,
          [path.resolve("test/fixtures/fake-claude-lifecycle.mjs"), ...args],
          {
            cwd,
            env: { ...process.env, CLAUDE_V2_MODE: "missing" },
            stdio: ["pipe", "pipe", "ignore"],
          },
        )),
    };
    const adapter = new ClaudeLifecycleAdapter();
    const factory = new ClaudeLifecycleExecutionFactory(
      adapter,
      provider,
      undefined,
      20,
      () => id,
      async (process) => {
        attempts++;
        if (attempts === 1) throw new Error("private termination detail");
        await killAndWait(process);
      },
    );
    const runtime = createDurableRuntime({
      store: new MemoryStore(),
      owner: { token: "test-owner", generation: 1 },
      bindings: [{ adapter, factory }],
    });
    try {
      const row = await runtime.manager.create({
        cwd: process.cwd(),
        harnessId: "claude",
      });
      expect(row.status).toBe("failed");
      expect(attempts).toBe(2);
      if (child) await waitClosed(child);
    } finally {
      if (child && child.exitCode === null && child.signalCode === null)
        await killAndWait(child);
      await runtime.shutdown();
    }
  });
});
async function killAndWait(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed = waitClosed(child);
  child.kill("SIGTERM");
  await closed;
}
function waitClosed(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null)
    return Promise.resolve();
  return new Promise((resolve) => child.once("close", () => resolve()));
}
