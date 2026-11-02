import { expect, it } from "vitest";
import type { HarnessAdapter } from "../src/core/adapter-contracts.js";
import type { LifecycleLaunchResult } from "../src/core/lifecycle-execution.js";
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
function runtime(
  launch: () => Promise<LifecycleLaunchResult>,
  stop: () => Promise<void>,
) {
  return createDurableRuntime({
    store: new MemoryStore(),
    owner: { token: "test-owner", generation: 1 },
    defaultId: "third",
    bindings: [
      {
        adapter,
        factory: { create: () => ({ launch, resume: async () => ({}), stop }) },
      },
    ],
  });
}

it("retains failed cleanup across shutdown retry without reopening admission", async () => {
  let fail = true;
  let launches = 0;
  let stops = 0;
  const instance = runtime(
    async () => {
      launches++;
      return {};
    },
    async () => {
      stops++;
      if (fail) throw new Error("stop failed");
    },
  );
  await instance.manager.create({ cwd: process.cwd() });
  await expect(instance.shutdown()).rejects.toThrow(
    "RUNTIME_SHUTDOWN_UNCONFIRMED",
  );
  fail = false;
  await instance.shutdown();
  await expect(
    instance.manager.create({ cwd: process.cwd() }),
  ).rejects.toMatchObject({ code: "SESSION_UNAVAILABLE" });
  expect({
    launches,
    stops,
    status: instance.manager.list()[0]?.status,
  }).toEqual({ launches: 1, stops: 2, status: "stopped" });
});

it("drains an admitted launch and confirms cleanup before shutdown resolves", async () => {
  let release!: () => void;
  let launched!: () => void;
  const launchStarted = new Promise<void>((resolve) => {
    launched = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let stops = 0;
  const instance = runtime(
    async () => {
      launched();
      await gate;
      return {};
    },
    async () => {
      stops++;
    },
  );
  const creating = instance.manager.create({ cwd: process.cwd() });
  await launchStarted;
  let shutdownDone = false;
  const shuttingDown = instance.shutdown().then(() => {
    shutdownDone = true;
  });
  await Promise.resolve();
  expect(shutdownDone).toBe(false);
  release();
  await Promise.all([creating, shuttingDown]);
  expect(stops).toBe(1);
  expect(instance.manager.list()[0]?.status).toBe("failed");
  await expect(
    instance.manager.create({ cwd: process.cwd() }),
  ).rejects.toMatchObject({ code: "SESSION_UNAVAILABLE" });
});
