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
describe("Claude runtime shutdown", () => {
  it("retains timed-out cleanup, rejects false success, and reconciles on retry", async () => {
    let child: ChildProcess | undefined;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
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
    const factory = new ClaudeLifecycleExecutionFactory(
      adapter,
      provider,
      undefined,
      500,
      () => id,
      async (process) => {
        await gate;
        await killAndWait(process);
      },
    );
    const runtime = createDurableRuntime({
      store: new MemoryStore(),
      owner: { token: "test-owner", generation: 1 },
      stopTimeoutMs: 10,
      bindings: [{ adapter, factory }],
    });
    let shutdown: Promise<void> | undefined;
    try {
      const row = await runtime.manager.create({
        cwd: process.cwd(),
        harnessId: "claude",
      });
      shutdown = runtime.shutdown();
      await expect(shutdown).rejects.toThrow("RUNTIME_SHUTDOWN_UNCONFIRMED");
      expect(runtime.manager.get(row.id).status).toBe("uncertain");
      release();
      if (child) await waitClosed(child);
      await runtime.shutdown();
      expect(runtime.manager.get(row.id).status).toBe("stopped");
    } finally {
      release();
      if (child && child.exitCode === null && child.signalCode === null)
        await killAndWait(child);
      if (shutdown) await shutdown.catch(() => undefined);
      await runtime.shutdown().catch(() => undefined);
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
