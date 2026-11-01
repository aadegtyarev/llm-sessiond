import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { HarnessRegistry } from "../src/core/adapter-registry.js";
import { DurableSessionManager } from "../src/core/durable-session-manager.js";
import { PiLifecycleAdapter } from "../src/harness/pi-lifecycle-adapter.js";
import { PiLifecycleExecutionFactory } from "../src/harness/pi-lifecycle-factory.js";
import { MemoryStore } from "./durable-memory-store.js";
import { fixture, tempDir } from "./helpers.js";

describe("Pi durable terminal manager fencing", () => {
  it("keeps malformed-stream uncertainty and rejects another write", async () => {
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
    const manager = new DurableSessionManager(
      new MemoryStore(),
      new HarnessRegistry([adapter], "pi"),
      new PiLifecycleExecutionFactory(adapter, provider),
      { token: "test-owner", generation: 1 },
      () => `opaque-${++sequence}`,
      1000,
      25,
    );
    try {
      const session = await manager.create({ cwd });
      const states: string[] = [];
      manager.inputs.subscribe((event) => states.push(event.state));
      await expect(
        manager.inputs.submit(session.id, { text: "malformed" }),
      ).rejects.toMatchObject({ code: "INPUT_UNCERTAIN" });
      expect(states).toEqual(["pending", "uncertain"]);
      await expect(
        manager.inputs.submit(session.id, { text: "must not write" }),
      ).rejects.toThrow();
      const { readFile } = await import("node:fs/promises");
      expect(await readFile(`${cwd}/prompt-count`, "utf8")).toBe("1");
      await manager.stop(session.id);
    } finally {
      await manager.shutdownOwned();
    }
  });
});
