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

it("fences resume after terminal runtime shutdown", async () => {
  let launches = 0;
  let resumes = 0;
  const runtime = createDurableRuntime({
    store: new MemoryStore(),
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
            resume: async () => {
              resumes++;
              return {};
            },
            stop: async () => {},
          }),
        },
      },
    ],
  });
  const session = await runtime.manager.create({ cwd: process.cwd() });
  await runtime.manager.stop(session.id);
  await runtime.shutdown();
  await expect(runtime.manager.resume(session.id)).rejects.toMatchObject({
    code: "SESSION_UNAVAILABLE",
  });
  expect({ launches, resumes }).toEqual({ launches: 1, resumes: 0 });
});
