import { expect, it } from "vitest";
import type { HarnessAdapter } from "../src/core/adapter-contracts.js";
import type { LifecycleExecutionFactory } from "../src/core/lifecycle-execution.js";
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
function runtime(factory: LifecycleExecutionFactory) {
  return createDurableRuntime({
    store: new MemoryStore(),
    owner: { token: "test-owner", generation: 1 },
    defaultId: "third",
    bindings: [{ adapter, factory }],
  });
}

it("closes create admission synchronously at terminal shutdown entry", async () => {
  let launches = 0;
  const store = new MemoryStore();
  const instance = createDurableRuntime({
    store,
    owner: { token: "test-owner", generation: 1 },
    defaultId: "third",
    bindings: [
      {
        adapter,
        factory: {
          create: () => ({
            launch: async () => {
              launches++;
              return {};
            },
            resume: async () => ({}),
            stop: async () => {},
          }),
        },
      },
    ],
  });
  const pending = instance.manager.create({ cwd: process.cwd() });
  const outcome = pending.then(
    () => "resolved",
    (error: unknown) => error,
  );
  await instance.shutdown();
  expect(await outcome).toMatchObject({ code: "SESSION_UNAVAILABLE" });
  expect(launches).toBe(0);
  expect(store.list()).toEqual([]);
});

it("rechecks admission after an adapter launch getter closes the runtime", async () => {
  let shutdown: Promise<void> | undefined;
  let launches = 0;
  let stops = 0;
  const instance = runtime({
    create: () => ({
      get launch() {
        shutdown = instance.shutdown();
        return async () => {
          launches++;
          return {};
        };
      },
      resume: async () => ({}),
      stop: async () => {
        stops++;
      },
    }),
  });
  const session = await instance.manager.create({ cwd: process.cwd() });
  await shutdown;
  expect({ launches, stops, status: session.status }).toEqual({
    launches: 0,
    stops: 1,
    status: "failed",
  });
});
