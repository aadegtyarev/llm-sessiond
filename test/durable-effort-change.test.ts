import { describe, expect, it } from "vitest";
import type { EffortChangeCallContext } from "../src/core/effort-change-port.js";
import { setup, synthetic } from "./durable-manager-support.js";

const adapter = {
  ...synthetic,
  descriptor: {
    ...synthetic.descriptor,
    capabilities: [...synthetic.descriptor.capabilities, "effort.change"],
  },
};

describe("durable effort change routing", () => {
  it("routes exact Unicode custom levels without effort.read", async () => {
    const level = " custom β/. ".repeat(64);
    const seen: string[] = [];
    const effortChange = {
      changeEffort: async (value: string, context: EffortChangeCallContext) => {
        seen.push(value);
        expect(context.beforeMutationWrite()).toBe(true);
        return { outcome: "applied" };
      },
    };
    const { manager } = setup({ adapter, effortChange });
    const session = await manager.create({ cwd: process.cwd() });
    await expect(manager.changeEffort(session.id, level)).resolves.toEqual({
      outcome: "applied",
    });
    await expect(manager.changeEffort(session.id, "")).resolves.toEqual({
      outcome: "applied",
    });
    expect(seen).toEqual([level, ""]);
  });
});
