import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import type { ProcessProvider } from "../src/core/ports.js";
import { createPiTestManager } from "./pi-durable-manager-support.js";
import { fixture, tempDir } from "./helpers.js";

const provider: ProcessProvider = {
  launch: (_exe, args, cwd) =>
    spawn(process.execPath, [fixture, ...args], {
      cwd,
      stdio: ["pipe", "pipe", "ignore"],
    }),
};

describe("Pi abort settlement ordering", () => {
  it("classifies early settlement only after the correlated abort result", async () => {
    const manager = createPiTestManager(
      provider,
      (() => {
        let id = 0;
        return () => `opaque-${++id}`;
      })(),
      1000,
    );
    try {
      const session = await manager.create({ cwd: await tempDir() });
      const events: Array<{ inputId: string; state: string; reason?: string }> =
        [];
      manager.inputs.subscribe((event) => {
        if ("inputId" in event) events.push(event);
      });
      for (const [text, expected, error] of [
        ["abort-settle-before-ack", "failed", undefined],
        ["abort-settle-before-reject", "completed", "OPERATION_FAILED"],
      ] as const) {
        const input = await manager.inputs.submit(session.id, { text });
        if (error)
          await expect(
            manager.inputs.cancel(session.id, input.inputId),
          ).rejects.toMatchObject({ code: error });
        else await manager.inputs.cancelCurrent(session.id);
        await new Promise((resolve) => setTimeout(resolve, 0));
        const event = events.find(
          (item) =>
            item.inputId === input.inputId &&
            !["pending", "accepted"].includes(item.state),
        );
        expect(event?.state).toBe(expected);
        if (expected === "failed") expect(event?.reason).toBe("canceled");
      }
      await manager.stop(session.id);
    } finally {
      await manager.shutdownOwned();
    }
  });
});
