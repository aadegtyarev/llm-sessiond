import { describe, expect, it } from "vitest";
import type { EffortChangeCallContext } from "../src/core/effort-change-port.js";
import { setup, synthetic } from "./durable-manager-support.js";

describe("durable effort change result fence", () => {
  it("rechecks source liveness after normalized outcome extraction", async () => {
    const adapter = {
      ...synthetic,
      descriptor: {
        ...synthetic.descriptor,
        capabilities: [...synthetic.descriptor.capabilities, "effort.change"],
      },
    };
    let event: ((value: unknown) => void) | undefined;
    const inputs = {
      submit: async () => ({ kind: "uncertain" as const }),
      cancel: async () => ({ kind: "uncertain" as const }),
      subscribe: (listener: (value: unknown) => void) => {
        event = listener;
        return () => {};
      },
    };
    const configured = setup({
      adapter,
      inputs,
      effortChange: {
        changeEffort: async (
          _level: string,
          context: EffortChangeCallContext,
        ) => {
          expect(context.beforeMutationWrite()).toBe(true);
          return new Proxy(
            {},
            {
              getPrototypeOf: () => {
                event?.({ kind: "execution-ended" });
                return Object.prototype;
              },
              ownKeys: () => ["outcome"],
              getOwnPropertyDescriptor: () => ({
                configurable: true,
                enumerable: true,
                value: "applied",
                writable: true,
              }),
            },
          );
        },
      },
    });
    const session = await configured.manager.create({ cwd: process.cwd() });
    await expect(
      configured.manager.changeEffort(session.id, "custom"),
    ).rejects.toMatchObject({
      code: "SESSION_UNAVAILABLE",
      outcome: "unknown",
    });
  });
});
