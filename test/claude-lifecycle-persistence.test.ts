import { spawn } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ProcessProvider } from "../src/core/ports.js";
import { createBuiltinDurableRuntime } from "../src/harness/builtin-durable-runtime.js";
import { MemoryStore } from "./durable-memory-store.js";

describe("Claude launch persistence cleanup", () => {
  it("stops the initialized process if durable running-state persistence fails", async () => {
    const store = new MemoryStore();
    store.failRunningStatus = true;
    let closed!: () => void;
    const childClosed = new Promise<void>((resolve) => (closed = resolve));
    const provider: ProcessProvider = {
      launch: (_exe, args, cwd) => {
        const child = spawn(
          process.execPath,
          [path.resolve("test/fixtures/fake-claude-lifecycle.mjs"), ...args],
          {
            cwd,
            env: { ...process.env, CLAUDE_V2_MODE: "ok" },
            stdio: ["pipe", "pipe", "ignore"],
          },
        );
        child.once("close", closed);
        return child;
      },
    };
    const runtime = createBuiltinDurableRuntime({
      store,
      owner: { token: "test-owner", generation: 1 },
      provider,
      readinessTimeoutMs: 500,
      stopTimeoutMs: 100,
    });
    await expect(
      runtime.manager.create({ cwd: process.cwd(), harnessId: "claude" }),
    ).rejects.toThrow("lifecycle operation failed");
    await childClosed;
    expect(store.list()[0]?.status).toBe("failed");
    await runtime.shutdown();
  });
});
