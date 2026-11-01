import { spawn } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ProcessProvider } from "../src/core/ports.js";
import { createPiDurableRuntime } from "../src/harness/pi-durable-runtime.js";
import { MemoryStore } from "./durable-memory-store.js";

const owner = { token: "test-owner", generation: 1 };
describe("Pi v2 startup cleanup", () => {
  it("terminates children on malformed, missing, rejected, mismatched, and timed-out readiness", async () => {
    for (const mode of [
      "malformed",
      "missing",
      "rejected",
      "timeout",
      "mismatch",
    ]) {
      let activeMode = mode === "mismatch" ? "ok" : mode;
      const closed: Promise<void>[] = [];
      const provider: ProcessProvider = {
        launch: (_exe, args, cwd) => {
          const child = spawn(
            process.execPath,
            [path.resolve("test/fixtures/fake-pi-lifecycle.mjs"), ...args],
            {
              cwd,
              env: { ...process.env, PI_V2_MODE: activeMode },
              stdio: ["pipe", "pipe", "ignore"],
            },
          );
          closed.push(
            new Promise((resolve) => child.once("close", () => resolve())),
          );
          return child;
        },
      };
      const runtime = createPiDurableRuntime({
        store: new MemoryStore(),
        owner,
        provider,
        id: () => `pi-${mode}`,
        stopTimeoutMs: 100,
        readinessTimeoutMs: mode === "timeout" ? 40 : 1000,
      });
      let row = await runtime.manager.create({ cwd: process.cwd() });
      if (mode === "mismatch") {
        await runtime.manager.stop(row.id);
        activeMode = mode;
        row = await runtime.manager.resume(row.id);
      }
      expect(row.status).toBe("failed");
      await Promise.all(closed);
      await runtime.shutdown();
    }
  });
});
