import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { HarnessRegistry } from "../src/core/adapter-registry.js";
import { DurableSessionManager } from "../src/core/durable-session-manager.js";
import { PiLifecycleAdapter } from "../src/harness/pi-lifecycle-adapter.js";
import { PiLifecycleExecutionFactory } from "../src/harness/pi-lifecycle-factory.js";
import { MemoryStore } from "./durable-memory-store.js";
import { fixture, tempDir } from "./helpers.js";

describe("Pi uncertain live settlement", () => {
  it("resolves timed-out delivery on live settlement without replay", async () => {
    const cwd = await tempDir();
    let sequence = 0;
    const adapter = new PiLifecycleAdapter();
    const provider = {
      launch: (_exe: string, args: string[], dir: string) =>
        spawn(process.execPath, [fixture, ...args], {
          cwd: dir,
          stdio: ["pipe", "pipe", "ignore"],
        }),
    };
    const factory = new PiLifecycleExecutionFactory(adapter, provider);
    const manager = new DurableSessionManager(
      new MemoryStore(),
      new HarnessRegistry([adapter], "pi"),
      factory,
      { token: "test-owner", generation: 1 },
      () => `opaque-${++sequence}`,
      1000,
      10,
    );
    try {
      const session = await manager.create({ cwd });
      const states: string[] = [];
      let resolveCompleted!: () => void;
      const completed = new Promise<void>((resolve) => {
        resolveCompleted = resolve;
      });
      manager.inputs.subscribe((event) => {
        states.push(event.state);
        if (event.inputId === "opaque-2" && event.state === "completed")
          resolveCompleted();
      });
      await expect(
        manager.inputs.submit(session.id, { text: "uncertain-then-settle" }),
      ).rejects.toMatchObject({ code: "INPUT_UNCERTAIN" });
      await completed;
      expect(states).toEqual(["pending", "uncertain", "completed"]);
      const next = await manager.inputs.submit(session.id, { text: "hold" });
      expect(next.inputId).toBe("opaque-3");
      const { readFile } = await import("node:fs/promises");
      expect(await readFile(`${cwd}/prompt-count`, "utf8")).toBe("11");
      await manager.stop(session.id);
    } finally {
      await manager.shutdownOwned();
    }
  });
});
