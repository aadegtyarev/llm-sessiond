import { expect, it } from "vitest";
import { TrackedLifecycleFactory } from "../src/harness/tracked-lifecycle-factory.js";
import { synthetic } from "./durable-manager-support.js";

it("forwards optional input ports through tracked executions", () => {
  const port = {
    submit: async () => ({ kind: "accepted" as const }),
    cancel: async () => ({ kind: "accepted" as const }),
    subscribe: () => () => {},
  };
  const tracker = new TrackedLifecycleFactory([
    {
      adapter: synthetic,
      factory: {
        create: () => ({
          inputs: port,
          launch: async () => ({}),
          resume: async () => ({}),
          stop: async () => {},
        }),
      },
    },
  ]);
  expect(tracker.create(synthetic).inputs).toBe(port);
});
