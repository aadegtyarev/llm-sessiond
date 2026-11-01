import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createPiTestManager } from "./pi-durable-manager-support.js";
import type { ProcessProvider } from "../src/core/ports.js";
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
    const manager = createPiTestManager(
      provider,
      () => `opaque-${++sequence}`,
      10,
    );
    try {
      const session = await manager.create({ cwd });
      const events: Array<{ inputId: string; state: string }> = [];
      let completeFirst!: () => void;
      const firstCompleted = new Promise<void>((resolve) => {
        completeFirst = resolve;
      });
      manager.inputs.subscribe((event) => {
        if ("inputId" in event)
          events.push({ inputId: event.inputId, state: event.state });
        if (
          "inputId" in event &&
          event.inputId === "opaque-2" &&
          event.state === "completed"
        )
          completeFirst();
      });
      const first = manager.inputs
        .submit(session.id, { text: "settle-delay-ack" })
        .then(
          (value) => ({ value }),
          (error: unknown) => ({ error }),
        );
      expect(await first).toMatchObject({ error: { code: "INPUT_UNCERTAIN" } });
      await firstCompleted;
      const second = await manager.inputs.submit(session.id, {
        text: "hold",
      });
      expect(second.inputId).toBe("opaque-3");
      await expect(readFile(`${cwd}/late-ack`, "utf8")).rejects.toMatchObject({
        code: "ENOENT",
      });
      await new Promise((resolve) => setTimeout(resolve, 350));
      expect(await readFile(`${cwd}/late-ack`, "utf8")).toBe("sent");
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
      await manager.stop(session.id);
    } finally {
      await manager.shutdownOwned();
    }
  });
});
