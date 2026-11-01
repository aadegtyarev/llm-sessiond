import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import { HarnessRegistry } from "../src/core/adapter-registry.js";
import { DurableSessionManager } from "../src/core/durable-session-manager.js";
import type { LifecycleExecutionFactory } from "../src/core/lifecycle-execution.js";
import type { ProcessProvider } from "../src/core/ports.js";
import { PiLifecycleAdapter } from "../src/harness/pi-lifecycle-adapter.js";
import { PiLifecycleExecution } from "../src/harness/pi-lifecycle-execution.js";
import { MemoryStore } from "./durable-memory-store.js";
import { fixture } from "./helpers.js";

const owner = { token: "test-owner", generation: 1 };
describe("Pi durable stop retry", () => {
  it("retains ownership through stop timeout until shared cleanup succeeds", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let closed!: () => void;
    const childClosed = new Promise<void>((resolve) => (closed = resolve));
    const provider: ProcessProvider = {
      launch: (_exe, args, cwd) => {
        const child = spawn(process.execPath, [fixture, ...args], {
          cwd,
          stdio: ["pipe", "pipe", "ignore"],
        });
        child.once("close", closed);
        return child;
      },
    };
    const adapter = new PiLifecycleAdapter();
    const factory: LifecycleExecutionFactory = {
      create: () =>
        new PiLifecycleExecution(
          adapter,
          provider,
          "fake",
          1000,
          async (child) => {
            await gate;
            await new Promise<void>((resolve) => {
              child.once("close", resolve);
              child.kill("SIGKILL");
            });
          },
        ),
    };
    const manager = new DurableSessionManager(
      new MemoryStore(),
      new HarnessRegistry([adapter], "pi"),
      factory,
      owner,
      () => "managed",
      10,
    );
    const session = await manager.create({ cwd: process.cwd() });
    let shutdownFinished = false;
    let shutdown: Promise<void> | undefined;
    try {
      await expect(manager.stop(session.id)).rejects.toThrow("timed out");
      await expect(manager.resume(session.id)).rejects.toMatchObject({
        code: "SESSION_UNAVAILABLE",
      });
      await expect(manager.delete(session.id)).rejects.toMatchObject({
        code: "SESSION_NOT_STOPPED",
      });
      shutdown = manager.shutdownOwned().then(() => {
        shutdownFinished = true;
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(shutdownFinished).toBe(false);
      expect(manager.get(session.id).status).toBe("uncertain");
    } finally {
      release();
      if (shutdown) await shutdown;
      else await manager.shutdownOwned();
      await childClosed;
      await manager.shutdownOwned();
    }
    expect(manager.get(session.id).status).toBe("stopped");
  });
});
