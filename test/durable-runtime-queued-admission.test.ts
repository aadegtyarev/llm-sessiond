import { expect, it } from "vitest";
import type { HarnessAdapter } from "../src/core/adapter-contracts.js";
import { createDurableRuntime } from "../src/harness/durable-runtime.js";
import { MemoryStore } from "./durable-memory-store.js";

const adapter: HarnessAdapter = {
  descriptor: {
    id: "third",
    aliases: [],
    capabilities: ["harness.launch", "harness.resume", "harness.stop"],
  },
  validateCheckpoint: () => true,
};

it("rejects resume queued behind cleanup when shutdown closes admission", async () => {
  let enterStop!: () => void;
  let releaseStop!: () => void;
  let resumes = 0;
  const stopEntered = new Promise<void>((resolve) => {
    enterStop = resolve;
  });
  const stopGate = new Promise<void>((resolve) => {
    releaseStop = resolve;
  });
  const runtime = createDurableRuntime({
    store: new MemoryStore(),
    owner: { token: "test-owner", generation: 1 },
    defaultId: "third",
    bindings: [
      {
        adapter,
        factory: {
          create: () => ({
            launch: async () => ({}),
            resume: async () => {
              resumes++;
              return {};
            },
            stop: async () => {
              enterStop();
              await stopGate;
            },
          }),
        },
      },
    ],
  });
  const session = await runtime.manager.create({ cwd: process.cwd() });
  const stopping = runtime.manager.stop(session.id);
  await stopEntered;
  const resuming = runtime.manager.resume(session.id);
  const outcome = resuming.then(
    () => "resolved",
    (error: unknown) => error,
  );
  const shutdown = runtime.shutdown();
  releaseStop();
  await Promise.all([stopping, shutdown]);
  expect(await outcome).toMatchObject({ code: "SESSION_UNAVAILABLE" });
  expect(resumes).toBe(0);
});
