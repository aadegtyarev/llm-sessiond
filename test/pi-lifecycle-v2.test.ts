import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { PiLifecycleAdapter } from "../src/harness/pi-lifecycle-adapter.js";
import { PiLifecycleExecutionFactory } from "../src/harness/pi-lifecycle-factory.js";
import { createPiDurableRuntime } from "../src/harness/pi-durable-runtime.js";
import type { ProcessProvider } from "../src/core/ports.js";
import { MemoryStore } from "./durable-memory-store.js";
import { fixture, tempDir } from "./helpers.js";

const owner = { token: "test-owner", generation: 1 };
describe("Pi v2 lifecycle adapter", () => {
  it("advertises only lifecycle and validates exact minimal checkpoints", () => {
    const adapter = new PiLifecycleAdapter();
    expect(adapter.descriptor).toEqual({
      id: "pi",
      aliases: [],
      capabilities: ["harness.launch", "harness.resume", "harness.stop"],
    });
    expect(adapter.validateCheckpoint({ sessionId: "id" })).toBe(true);
    expect(
      adapter.validateCheckpoint({ sessionId: "id", prompt: "secret" }),
    ).toBe(false);
    expect(adapter.validateCheckpoint({ sessionId: "" })).toBe(false);
  });
  it("persists exact Pi identity and uses it for resume; shutdown stops ownership first", async () => {
    const cwd = await tempDir();
    const calls: string[] = [];
    const provider: ProcessProvider = {
      launch: (_executable, args, workingDir) => {
        calls.push(`launch:${args.join(" ")}:${workingDir}`);
        return spawn(process.execPath, [fixture, ...args], {
          cwd: workingDir,
          stdio: ["pipe", "pipe", "ignore"],
        });
      },
      shutdown: async () => {
        calls.push("provider-shutdown");
      },
    };
    const runtime = createPiDurableRuntime({
      store: new MemoryStore(),
      owner,
      provider,
      id: () => "session-1",
      stopTimeoutMs: 100,
    });
    expect(calls).toEqual([]);
    const created = await runtime.manager.create({ cwd });
    expect(created.status).toBe("running");
    expect(created.nativeSessionId).toBe("native-exact");
    expect(created.adapterState?.data).toEqual({ sessionId: "native-exact" });
    await runtime.manager.stop(created.id);
    const resumed = await runtime.manager.resume(created.id);
    expect(resumed.status).toBe("running");
    expect(calls[0]).toBe(`launch:--mode rpc:${cwd}`);
    expect(calls[1]).toBe("launch:--mode rpc --session native-exact:" + cwd);
    await runtime.shutdown();
    expect(calls.at(-1)).toBe("provider-shutdown");
  });
  it("rejects options and identity mismatch before spawning", async () => {
    let launches = 0;
    const adapter = new PiLifecycleAdapter();
    const factory = new PiLifecycleExecutionFactory(adapter, {
      launch: () => {
        launches++;
        throw new Error("unexpected spawn");
      },
    });
    const execution = factory.create(adapter);
    await expect(
      execution.launch({ cwd: process.cwd(), options: {} }),
    ).rejects.toThrow("UNSUPPORTED_OPTIONS");
    await expect(
      execution.resume({
        cwd: process.cwd(),
        checkpoint: {
          namespace: "pi.session",
          version: 1,
          data: { sessionId: "one" },
        },
        nativeSessionId: "two",
      }),
    ).rejects.toThrow("SESSION_ID_MISMATCH");
    expect(launches).toBe(0);
    await execution.stop();
    await execution.stop();
  });
  it("rejects factory use with a different adapter", () => {
    const adapter = new PiLifecycleAdapter();
    const factory = new PiLifecycleExecutionFactory(adapter, {
      launch: () => {
        throw new Error("spawned");
      },
    });
    expect(() => factory.create(new PiLifecycleAdapter())).toThrow(
      "UNSUPPORTED_ADAPTER",
    );
  });
});
