import { describe, expect, it } from "vitest";
import type { LifecycleExecution } from "../src/core/lifecycle-execution.js";
import { checkpoint, setup } from "./durable-manager-support.js";
async function exercise(
  kind: "launch" | "resume",
  cleanup: "reject" | "timeout",
) {
  let live = false;
  let factories = 0;
  let launches = 0;
  let stops = 0;
  let mode: "reject" | "timeout" | "success" = cleanup;
  let release!: () => void;
  const never = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ref: { current?: ReturnType<typeof setup>["store"] } = {};
  const configured = setup({
    factory: () => {
      factories++;
      const execution: LifecycleExecution = {
        launch: async () => {
          launches++;
          live = true;
          if (kind === "launch") {
            ref.current!.rows.delete("session-1");
            throw new Error("partial launch");
          }
          return { nativeSessionId: "native", checkpoint: checkpoint(1) };
        },
        resume: async () => {
          ref.current!.rows.delete("session-1");
          live = true;
          throw new Error("partial resume");
        },
        stop: async () => {
          stops++;
          if (mode === "reject") throw new Error("cleanup failed");
          if (mode === "timeout") await never;
          live = false;
        },
      };
      return execution;
    },
    timeout: 5,
  });
  ref.current = configured.store;
  if (kind === "launch")
    await expect(
      configured.manager.create({ cwd: process.cwd() }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  else {
    const row = await configured.manager.create({ cwd: process.cwd() });
    mode = "success";
    await configured.manager.stop(row.id);
    mode = cleanup;
    await expect(configured.manager.resume(row.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  }
  expect(live).toBe(true);
  await expect(
    configured.manager.create({ cwd: process.cwd() }),
  ).rejects.toMatchObject({ code: "SESSION_ID_COLLISION" });
  expect(factories).toBe(kind === "launch" ? 1 : 2);
  expect(launches).toBe(kind === "launch" ? 1 : 1);
  mode = "success";
  release();
  await expect(configured.manager.shutdownOwned()).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  expect(live).toBe(false);
  expect(stops).toBe(kind === "launch" ? 2 : 3);
  await expect(
    configured.manager.create({ cwd: process.cwd() }),
  ).rejects.toMatchObject({ code: "SESSION_ID_COLLISION" });
}
describe("retained execution ID collision", () => {
  it("blocks launch/resume IDs after reject/timeout cleanup and row loss", async () => {
    for (const kind of ["launch", "resume"] as const)
      for (const cleanup of ["reject", "timeout"] as const)
        await exercise(kind, cleanup);
  });
});
