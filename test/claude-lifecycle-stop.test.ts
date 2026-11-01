import { spawn } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ChildProcess } from "node:child_process";
import { ClaudeLifecycleAdapter } from "../src/harness/claude-lifecycle-adapter.js";
import { ClaudeLifecycleExecutionFactory } from "../src/harness/claude-lifecycle-factory.js";
import type { ProcessProvider } from "../src/core/ports.js";

const id = "12345678-abcd-4abc-8abc-1234567890ab";
describe("Claude child stop confirmation", () => {
  it("coalesces gated stops, permits retry, and always cleans up", async () => {
    let child: ChildProcess | undefined;
    let attempts = 0;
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
    const execution = new ClaudeLifecycleExecutionFactory(
      adapter,
      provider,
      undefined,
      500,
      () => id,
      async (target) => {
        attempts++;
        if (attempts === 1) {
          await gate;
          return;
        }
        await killAndWait(target);
      },
    ).create(adapter);
    let firstDone = false;
    let secondDone = false;
    try {
      await execution.launch({ cwd: process.cwd() });
      const first = execution.stop().then(
        () => {
          firstDone = true;
        },
        () => {
          firstDone = true;
          throw new Error("CLAUDE_STOP_UNCONFIRMED");
        },
      );
      const second = execution.stop().then(
        () => {
          secondDone = true;
        },
        () => {
          secondDone = true;
          throw new Error("CLAUDE_STOP_UNCONFIRMED");
        },
      );
      void first.catch(() => undefined);
      void second.catch(() => undefined);
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(firstDone).toBe(false);
      expect(secondDone).toBe(false);
      release();
      const rejected = await Promise.allSettled([first, second]);
      expect(
        rejected.map(
          (result) => result.status === "rejected" && result.reason.message,
        ),
      ).toEqual(["CLAUDE_STOP_UNCONFIRMED", "CLAUDE_STOP_UNCONFIRMED"]);
      await Promise.all([execution.stop(), execution.stop()]);
      expect(attempts).toBe(2);
    } finally {
      release();
      if (child && child.exitCode === null && child.signalCode === null)
        await killAndWait(child);
      await execution.stop().catch(() => undefined);
    }
  });
});
async function killAndWait(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise<void>((resolve) =>
    child.once("close", () => resolve()),
  );
  child.kill("SIGTERM");
  await closed;
}
