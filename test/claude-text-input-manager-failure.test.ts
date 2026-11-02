import { spawn } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ProcessProvider } from "../src/core/ports.js";
import { createBuiltinDurableRuntime } from "../src/harness/builtin-durable-runtime.js";
import { MemoryStore } from "./durable-memory-store.js";
const owner = { token: "test-owner", generation: 1 };
const nativeId = "12345678-abcd-4abc-8abc-1234567890ab";
function provider(mode: string): ProcessProvider {
  return {
    launch: (_exe, args, cwd) =>
      spawn(
        process.execPath,
        [path.resolve("test/fixtures/fake-claude-lifecycle.mjs"), ...args],
        {
          cwd,
          env: { ...process.env, CLAUDE_V2_MODE: mode },
          stdio: ["pipe", "pipe", "ignore"],
        },
      ),
  };
}
describe("Claude manager failure settlement", () => {
  it("keeps missing-replay delivery uncertain and refuses replay, image, and cancellation", async () => {
    const runtime = createBuiltinDurableRuntime({
      store: new MemoryStore(),
      owner,
      provider: provider("text-no-replay"),
      nativeId: () => nativeId,
      readinessTimeoutMs: 500,
    });
    try {
      const row = await runtime.manager.create({
        cwd: process.cwd(),
        harnessId: "claude-code",
      });
      await expect(
        runtime.manager.inputs.submit(row.id, { text: "possibly delivered" }),
      ).rejects.toMatchObject({ code: "INPUT_UNCERTAIN" });
      await expect(
        runtime.manager.inputs.submit(row.id, { text: "must not replay" }),
      ).rejects.toMatchObject({ code: "INPUT_BUSY" });
      await expect(
        runtime.manager.inputs.cancel(row.id, "local-id"),
      ).rejects.toMatchObject({ code: "UNSUPPORTED_CAPABILITY" });
      await expect(
        runtime.manager.inputs.submit(row.id, {
          text: "image",
          images: [{ mimeType: "image/png", data: "" }],
        }),
      ).rejects.toMatchObject({ code: "UNSUPPORTED_CAPABILITY" });
    } finally {
      await runtime.shutdown();
    }
  }, 10_000);
  it("fails an accepted native turn without inventing a prompt reason", async () => {
    const runtime = createBuiltinDurableRuntime({
      store: new MemoryStore(),
      owner,
      provider: provider("text-error"),
      nativeId: () => nativeId,
      readinessTimeoutMs: 500,
    });
    try {
      const row = await runtime.manager.create({
        cwd: process.cwd(),
        harnessId: "claude-code",
      });
      const events: Array<{ state: string; reason?: string }> = [];
      runtime.manager.inputs.subscribe((event) => events.push(event));
      const submitted = await runtime.manager.inputs.submit(row.id, {
        text: "accepted then failed",
      });
      expect(submitted.resumed).toBe(false);
      await new Promise((resolve) => setTimeout(resolve, 50));
      const failure = events.find((event) => event.state === "failed");
      expect(failure).toBeDefined();
      expect(failure).not.toHaveProperty("reason");
    } finally {
      await runtime.shutdown();
    }
  });
});
