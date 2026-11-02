import { describe, expect, it } from "vitest";
import { setup, synthetic } from "./durable-manager-support.js";

describe("durable effort change generation invalidation", () => {
  it("blocks a pre-write operation after the execution generation changes", async () => {
    const adapter = {
      ...synthetic,
      descriptor: {
        ...synthetic.descriptor,
        capabilities: [...synthetic.descriptor.capabilities, "effort.change"],
      },
    };
    let started!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let writes = 0;
    const configured = setup({
      adapter,
      effortChange: {
        changeEffort: async (_level, context) => {
          started();
          await gate;
          if (context.beforeMutationWrite()) writes += 1;
          return { outcome: "applied" };
        },
      },
    });
    const session = await configured.manager.create({ cwd: process.cwd() });
    const operation = configured.manager.changeEffort(session.id, "exact");
    const rejection = expect(operation).rejects.toMatchObject({
      code: "SESSION_UNAVAILABLE",
      outcome: "not-applied",
    });
    await entered;
    await configured.manager.stop(session.id);
    await configured.manager.resume(session.id);
    release();
    await rejection;
    expect(writes).toBe(0);
  });
});
