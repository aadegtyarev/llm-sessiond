import { describe, expect, it } from "vitest";
import { createBuiltinDurableRuntime } from "../src/harness/builtin-durable-runtime.js";
import { MemoryStore } from "./durable-memory-store.js";
import { claudeFixtureProvider } from "./claude-lifecycle-fixture-provider.js";

const owner = { token: "test-owner", generation: 1 };
const sessionId = "12345678-abcd-4abc-8abc-1234567890ab";

describe("Claude lifecycle adapter", () => {
  it("registers strict Claude identity and launches/resumes without a model turn", async () => {
    const calls: string[] = [];
    const runtime = createBuiltinDurableRuntime({
      store: new MemoryStore(),
      owner,
      provider: claudeFixtureProvider("ok", calls),
      nativeId: () => sessionId,
      readinessTimeoutMs: 500,
    });
    expect(runtime.claude.descriptor.capabilities).toEqual([
      "harness.launch",
      "harness.resume",
      "harness.stop",
      "input.submit",
    ]);
    const row = await runtime.manager.create({
      cwd: process.cwd(),
      harnessId: "claude",
    });
    expect(row.status).toBe("running");
    expect(row.nativeSessionId).toBe(sessionId);
    expect(row.adapterState?.data).toEqual({ sessionId });
    expect(calls[0]).toContain(`--session-id ${sessionId}`);
    await runtime.manager.stop(row.id);
    const resumed = await runtime.manager.resume(row.id);
    expect(resumed.status).toBe("running");
    expect(calls[1]).toContain(`--resume ${sessionId}`);
    expect(calls.join(" ")).not.toContain("--fork-session");
    await runtime.shutdown();
  });
  it("accepts fragmented UTF-8 metadata and CRLF initialization records", async () => {
    const runtime = createBuiltinDurableRuntime({
      store: new MemoryStore(),
      owner,
      provider: claudeFixtureProvider("fragmented", []),
      nativeId: () => sessionId,
      readinessTimeoutMs: 500,
    });
    const row = await runtime.manager.create({
      cwd: process.cwd(),
      harnessId: "claude",
    });
    expect(row.status).toBe("running");
    await runtime.shutdown();
  });
  it("fails exact resume explicitly when Claude has no saved transcript", async () => {
    let mode = "ok";
    const calls: string[] = [];
    const runtime = createBuiltinDurableRuntime({
      store: new MemoryStore(),
      owner,
      provider: claudeFixtureProvider(() => mode, calls),
      nativeId: () => sessionId,
      readinessTimeoutMs: 500,
      stopTimeoutMs: 100,
    });
    const created = await runtime.manager.create({
      cwd: process.cwd(),
      harnessId: "claude-code",
    });
    await runtime.manager.stop(created.id);
    mode = "missing-transcript";
    const resumed = await runtime.manager.resume(created.id);
    expect(resumed.status).toBe("failed");
    expect(calls[1]).toContain(`--resume ${sessionId}`);
    expect(calls[1]).not.toContain("--session-id");
    await runtime.shutdown();
  });
});
