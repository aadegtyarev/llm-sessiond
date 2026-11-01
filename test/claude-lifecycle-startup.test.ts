import { spawn } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ProcessProvider } from "../src/core/ports.js";
import { createBuiltinDurableRuntime } from "../src/harness/builtin-durable-runtime.js";
import { MemoryStore } from "./durable-memory-store.js";

const owner = { token: "test-owner", generation: 1 };
const modes = [
  "malformed",
  "missing",
  "oversized",
  "wrong-correlation",
  "mismatch",
  "rejected",
  "early-exit",
];
describe("Claude startup validation and cleanup", () => {
  it("fails closed and confirms cleanup for malformed or absent initialization", async () => {
    for (const mode of modes) {
      const closed: Promise<void>[] = [];
      const provider: ProcessProvider = {
        launch: (_exe, args, cwd) => {
          const child = spawn(
            process.execPath,
            [path.resolve("test/fixtures/fake-claude-lifecycle.mjs"), ...args],
            {
              cwd,
              env: { ...process.env, CLAUDE_V2_MODE: mode },
              stdio: ["pipe", "pipe", "ignore"],
            },
          );
          closed.push(
            new Promise((resolve) => child.once("close", () => resolve())),
          );
          return child;
        },
      };
      const runtime = createBuiltinDurableRuntime({
        store: new MemoryStore(),
        owner,
        provider,
        id: () => "12345678-abcd-4abc-8abc-1234567890ab",
        stopTimeoutMs: 100,
        readinessTimeoutMs: mode === "missing" ? 30 : 500,
      });
      const row = await runtime.manager.create({
        cwd: process.cwd(),
        harnessId: "claude-code",
      });
      expect(row.status, mode).toBe("failed");
      await Promise.all(closed);
      await runtime.shutdown();
    }
  });
});
