import { describe, expect, it, vi } from "vitest";
import type { EffortChangeCallContext } from "../src/core/effort-change-port.js";
import { setup, synthetic } from "./durable-manager-support.js";

const adapter = {
  ...synthetic,
  descriptor: {
    ...synthetic.descriptor,
    capabilities: [...synthetic.descriptor.capabilities, "effort.change"],
  },
};

describe("durable effort change deadline", () => {
  it.each([false, true])(
    "expires operation without allowing a late setter (mutation=%s)",
    async (mutated) => {
      vi.useFakeTimers();
      let release!: () => void;
      const waiting = new Promise<void>((resolve) => {
        release = resolve;
      });
      let lateWrites = 0;
      const effortChange = {
        changeEffort: async (
          _level: string,
          context: EffortChangeCallContext,
        ) => {
          if (mutated) expect(context.beforeMutationWrite()).toBe(true);
          await waiting;
          if (!mutated) {
            if (context.beforeMutationWrite()) lateWrites += 1;
            return { outcome: "not-applied" };
          }
          return { outcome: "applied" };
        },
      };
      try {
        const { manager } = setup({ adapter, effortChange });
        const session = await manager.create({ cwd: process.cwd() });
        const operation = manager.changeEffort(session.id, "custom");
        const rejection = expect(operation).rejects.toMatchObject({
          code: "OPERATION_TIMEOUT",
          outcome: mutated ? "unknown" : "not-applied",
        });
        await vi.advanceTimersByTimeAsync(30_000);
        await rejection;
        release();
        await Promise.resolve();
        expect(lateWrites).toBe(0);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    },
  );
});
