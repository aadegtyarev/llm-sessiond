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

describe("Pi durable manager cancellation", () => {
  it("cancelCurrent targets the exact accepted input and settles only on agent_settled", async () => {
    const manager = createPiTestManager(provider, () => "exact", 1000);
    try {
      const session = await manager.create({ cwd: await tempDir() });
      const events: Array<{ inputId: string; state: string; reason?: string }> =
        [];
      let settled!: () => void;
      const finished = new Promise<void>((resolve) => {
        settled = resolve;
      });
      manager.inputs.subscribe((event) => {
        if ("inputId" in event) {
          events.push(event);
          if (event.state === "failed") settled();
        }
      });
      await manager.inputs.submit(session.id, { text: "abort-delay-settle" });
      await manager.inputs.cancelCurrent(session.id);
      await finished;
      expect(events.at(-1)).toMatchObject({
        inputId: "exact",
        state: "failed",
        reason: "canceled",
      });
      await manager.stop(session.id);
    } finally {
      await manager.shutdownOwned();
    }
  });

  it("preserves uncertain abort outcome when settlement arrives before timeout", async () => {
    const manager = createPiTestManager(provider, () => "exact", 35);
    try {
      const session = await manager.create({ cwd: await tempDir() });
      await manager.inputs.submit(session.id, {
        text: "abort-timeout-settled",
      });
      await expect(
        manager.inputs.cancelCurrent(session.id),
      ).rejects.toMatchObject({
        code: "INPUT_UNCERTAIN",
      });
      await manager.stop(session.id);
    } finally {
      await manager.shutdownOwned();
    }
  });

  it("reports definite abort rejection without fake input failure and allows retry", async () => {
    const manager = createPiTestManager(provider, () => "exact", 1000);
    try {
      const session = await manager.create({ cwd: await tempDir() });
      await manager.inputs.submit(session.id, { text: "abort-reject" });
      await expect(
        manager.inputs.cancel(session.id, "exact"),
      ).rejects.toMatchObject({
        code: "OPERATION_FAILED",
        failureReason: undefined,
      });
      await expect(
        manager.inputs.cancelCurrent(session.id),
      ).rejects.toMatchObject({
        code: "OPERATION_FAILED",
      });
      await manager.stop(session.id);
    } finally {
      await manager.shutdownOwned();
    }
  });
});
