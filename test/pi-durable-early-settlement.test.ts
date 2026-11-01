import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createPiDurableRuntime } from "../src/harness/pi-durable-runtime.js";
import type { ProcessProvider } from "../src/core/ports.js";
import { MemoryStore } from "./durable-memory-store.js";
import { fixture, tempDir } from "./helpers.js";

describe("Pi early settlement ordering", () => {
  it("allows next input before old ACK; late ACK cannot alter it", async () => {
    const cwd = await tempDir();
    let sequence = 0;
    const provider: ProcessProvider = {
      launch: (_exe, args, dir) =>
        spawn(process.execPath, [fixture, ...args], {
          cwd: dir,
          stdio: ["pipe", "pipe", "ignore"],
        }),
    };
    const runtime = createPiDurableRuntime({
      store: new MemoryStore(),
      owner: { token: "test-owner", generation: 1 },
      provider,
      id: () => `opaque-${++sequence}`,
    });
    try {
      const session = await runtime.manager.create({ cwd });
      const events: Array<{ inputId: string; state: string }> = [];
      let completeFirst!: () => void;
      const firstCompleted = new Promise<void>((resolve) => {
        completeFirst = resolve;
      });
      runtime.manager.inputs.subscribe((event) => {
        if ("inputId" in event)
          events.push({ inputId: event.inputId, state: event.state });
        if (
          "inputId" in event &&
          event.inputId === "opaque-2" &&
          event.state === "completed"
        )
          completeFirst();
      });
      let firstResolved = false;
      const first = runtime.manager.inputs
        .submit(session.id, { text: "settle-delay-ack" })
        .then((value) => {
          firstResolved = true;
          return value;
        });
      await firstCompleted;
      const second = await runtime.manager.inputs.submit(session.id, {
        text: "hold",
      });
      expect(second.inputId).toBe("opaque-3");
      expect(firstResolved).toBe(false);
      await new Promise((resolve) => setTimeout(resolve, 350));
      expect(await first).toEqual({ inputId: "opaque-2", resumed: false });
      expect(events).not.toContainEqual({
        inputId: "opaque-2",
        state: "accepted",
      });
      expect(events).toContainEqual({ inputId: "opaque-3", state: "accepted" });
      expect(events).not.toContainEqual({
        inputId: "opaque-3",
        state: "completed",
      });
      expect(await readFile(`${cwd}/prompt-count`, "utf8")).toBe("11");
      await runtime.manager.stop(session.id);
    } finally {
      await runtime.shutdown();
    }
  });
});
