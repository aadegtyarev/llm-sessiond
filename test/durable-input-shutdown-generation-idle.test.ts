import { expect, it } from "vitest";
import { configured } from "./durable-input-runtime-support.js";

it("shutdown queued behind old stop unsubscribes the replacement execution", async () => {
  let unsubscribes = 0;
  let stopCount = 0;
  let releaseOldStop!: () => void;
  let oldStopStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    oldStopStarted = resolve;
  });
  const { manager } = configured(
    {
      submit: async () => ({ kind: "accepted" }),
      cancel: async () => ({ kind: "accepted" }),
      subscribe: () => () => {
        unsubscribes++;
      },
    },
    undefined,
    5000,
    true,
    undefined,
    undefined,
    async () => {
      if (++stopCount === 1) {
        oldStopStarted();
        await new Promise<void>((resolve) => {
          releaseOldStop = resolve;
        });
      }
    },
    5000,
  );
  const row = await manager.create({ cwd: process.cwd() });
  const stop = manager.stop(row.id);
  await started;
  const resume = manager.resume(row.id);
  const shutdown = manager.shutdownOwned();
  releaseOldStop();
  await Promise.all([stop, resume, shutdown]);
  expect(stopCount).toBe(2);
  expect(unsubscribes).toBe(2);
});
