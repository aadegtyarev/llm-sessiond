import { spawn } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ProcessProvider } from "../src/core/ports.js";
import { createBuiltinDurableRuntime } from "../src/harness/builtin-durable-runtime.js";
import { MemoryStore } from "./durable-memory-store.js";

const owner = { token: "test-owner", generation: 1 };
const nativeId = "12345678-abcd-4abc-8abc-1234567890ab";
function provider(mode: string, calls: string[]): ProcessProvider {
  return {
    launch: (_exe, args, cwd) => {
      calls.push(args.join(" "));
      return spawn(
        process.execPath,
        [path.resolve("test/fixtures/fake-claude-lifecycle.mjs"), ...args],
        {
          cwd,
          env: { ...process.env, CLAUDE_V2_MODE: mode },
          stdio: ["pipe", "pipe", "ignore"],
        },
      );
    },
  };
}
describe("Claude manager text input", () => {
  it("submits through the built-in tracked port and exact resume", async () => {
    const calls: string[] = [];
    const runtime = createBuiltinDurableRuntime({
      store: new MemoryStore(),
      owner,
      provider: provider("text-success", calls),
      nativeId: () => nativeId,
      readinessTimeoutMs: 500,
    });
    try {
      const row = await runtime.manager.create({
        cwd: process.cwd(),
        harnessId: "claude",
      });
      expect(runtime.claude.descriptor.capabilities).toContain("input.submit");
      expect(runtime.claude.descriptor.capabilities).not.toContain(
        "input.submit-images",
      );
      expect(runtime.claude.descriptor.capabilities).not.toContain(
        "input.cancel",
      );
      await expect(
        runtime.manager.inputs.submit(row.id, {
          text: "image",
          images: [{ mimeType: "image/png", data: "" }],
        }),
      ).rejects.toMatchObject({ code: "UNSUPPORTED_CAPABILITY" });
      await expect(
        runtime.manager.inputs.cancel(row.id, "not-current"),
      ).rejects.toMatchObject({ code: "INPUT_NOT_CURRENT" });
      const events: unknown[] = [];
      runtime.manager.inputs.subscribe((event) => events.push(event));
      const first = await runtime.manager.inputs.submit(row.id, {
        text: "a".repeat(256 * 1024),
      });
      expect(first).toMatchObject({ resumed: false });
      expect(events).toContainEqual({
        sessionId: row.id,
        inputId: first.inputId,
        state: "completed",
      });
      await runtime.manager.stop(row.id);
      const resumed = await runtime.manager.inputs.submit(row.id, {
        text: "resume text",
      });
      expect(resumed).toMatchObject({ resumed: true });
      expect(calls[1]).toContain(`--resume ${nativeId}`);
      expect(calls[1]).not.toContain("--session-id");
    } finally {
      await runtime.shutdown();
    }
  });
});
