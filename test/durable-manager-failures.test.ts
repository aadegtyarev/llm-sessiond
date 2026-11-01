import { describe, expect, it } from "vitest";
import { setup, checkpoint } from "./durable-manager-support.js";
describe("durable lifecycle safe failures", () => {
  it("records starting before execution and bounds factory/launch failures", async () => {
    const launch = setup({
      launch: async () => {
        throw new Error("raw secret message");
      },
    });
    const row = await launch.manager.create({ cwd: process.cwd() });
    expect(launch.calls[0]).toBe("launch:starting");
    expect(row.status).toBe("failed");
    expect(row.failureReason).toBe("LAUNCH_FAILED");
    expect(row.failureReason).not.toContain("raw");
    const factory = setup({
      factory: () => {
        throw new Error("raw factory message");
      },
    });
    expect(
      (await factory.manager.create({ cwd: process.cwd() })).failureReason,
    ).toBe("LAUNCH_FAILED");
  });
  it("marks resume failure safely and clears failure metadata after later success", async () => {
    const { manager, store } = setup({
      resume: async () => {
        throw new Error("raw resume message");
      },
    });
    const row = await manager.create({ cwd: process.cwd() });
    await manager.stop(row.id);
    const failed = await manager.resume(row.id);
    expect(failed.status).toBe("failed");
    expect(failed.failureReason).toBe("RESUME_FAILED");
    expect(failed.failureReason).not.toContain("raw");
    const resumed = setup();
    resumed.store.create({
      ...row,
      status: "failed",
      failureReason: "OLD_SAFE",
      failedAt: "then",
      adapterState: checkpoint(4),
    });
    expect(
      (await resumed.manager.resume(row.id)).failureReason,
    ).toBeUndefined();
    expect(store.get(row.id)?.status).toBe("failed");
  });
  it("maps stop failure and timeout to safe uncertain outcomes", async () => {
    const cases = [
      {
        stop: async () => {
          throw new Error("raw stop message");
        },
        code: "OPERATION_FAILED",
      },
      {
        stop: async () => new Promise<void>(() => {}),
        code: "OPERATION_TIMEOUT",
      },
    ];
    for (const item of cases) {
      let calls = 0;
      const { manager } = setup({
        stop: async () => {
          calls++;
          return item.stop();
        },
        timeout: 5,
      });
      const row = await manager.create({ cwd: process.cwd() });
      const error = (await manager
        .stop(row.id)
        .catch((reason: unknown) => reason)) as Error & { code: string };
      expect(error.code).toBe(item.code);
      expect(error.message).not.toContain("raw");
      if (item.code === "OPERATION_TIMEOUT") {
        await expect(manager.stop(row.id)).rejects.toMatchObject({
          code: "SESSION_UNAVAILABLE",
        });
        expect(calls).toBe(1);
      }
      const uncertain = manager.get(row.id);
      expect(uncertain.status).toBe("uncertain");
      expect(uncertain.failureReason).toBe("STOP_FAILED");
    }
  });
});
