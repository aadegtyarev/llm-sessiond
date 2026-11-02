import { expect, it } from "vitest";
import type { OwnerGeneration } from "../src/persistence/session-record.js";
import { createDurableRuntime } from "../src/harness/durable-runtime.js";
import { MemoryStore } from "./durable-memory-store.js";

class ShutdownOnOwnerCheckStore extends MemoryStore {
  onOwnerCheck: (() => void) | undefined;
  override assertOwner(owner: OwnerGeneration) {
    this.onOwnerCheck?.();
    super.assertOwner(owner);
  }
}

it("rejects create if owner validation reentrantly closes admission", async () => {
  const store = new ShutdownOnOwnerCheckStore();
  let shutdown: Promise<void> | undefined;
  let launches = 0;
  const runtime = createDurableRuntime({
    store,
    owner: { token: "test-owner", generation: 1 },
    defaultId: "test",
    bindings: [
      {
        adapter: {
          descriptor: {
            id: "test",
            aliases: [],
            capabilities: ["harness.launch", "harness.stop", "harness.resume"],
          },
          validateCheckpoint: () => true,
        },
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
  let trigger = true;
  store.onOwnerCheck = () => {
    if (!trigger) return;
    trigger = false;
    shutdown = runtime.shutdown();
  };
  const outcome = runtime.manager.create({ cwd: process.cwd() }).then(
    () => "resolved",
    (error: unknown) => error,
  );
  const result = await outcome;
  await shutdown;
  expect(result).toMatchObject({ code: "SESSION_UNAVAILABLE" });
  expect(store.list()).toEqual([]);
  expect(launches).toBe(0);
  expect(trigger).toBe(false);
});
