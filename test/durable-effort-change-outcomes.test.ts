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

describe("durable effort change outcomes", () => {
  it("fails closed for capability, input, state, port and result errors", async () => {
    const plain = setup();
    const session = await plain.manager.create({ cwd: process.cwd() });
    await expect(
      plain.manager.changeEffort(session.id, "x"),
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_CAPABILITY",
      outcome: "not-applied",
    });
    let stoppedWrites = 0;
    const stopped = setup({
      adapter,
      effortChange: {
        changeEffort: async () => {
          stoppedWrites += 1;
          return { outcome: "applied" };
        },
      },
    });
    const stoppedSession = await stopped.manager.create({ cwd: process.cwd() });
    await stopped.manager.stop(stoppedSession.id);
    await expect(
      stopped.manager.changeEffort(stoppedSession.id, "x"),
    ).rejects.toMatchObject({
      code: "SESSION_NOT_RUNNING",
      outcome: "not-applied",
    });
    expect(stoppedWrites).toBe(0);
    const invalid = setup({ adapter });
    const invalidSession = await invalid.manager.create({ cwd: process.cwd() });
    await expect(
      invalid.manager.changeEffort(invalidSession.id, 7),
    ).rejects.toMatchObject({
      code: "INVALID_EFFORT",
      outcome: "not-applied",
    });
    const unguarded = setup({
      adapter,
      effortChange: { changeEffort: async () => ({ outcome: "applied" }) },
    });
    const unguardedSession = await unguarded.manager.create({
      cwd: process.cwd(),
    });
    await expect(
      unguarded.manager.changeEffort(unguardedSession.id, "custom"),
    ).rejects.toMatchObject({ outcome: "unknown" });
    const malformed = setup({
      adapter,
      effortChange: {
        changeEffort: async (
          _level: string,
          context: EffortChangeCallContext,
        ) => {
          expect(context.beforeMutationWrite()).toBe(true);
          return new Proxy(
            {},
            {
              ownKeys: () => {
                throw new Error("native secret");
              },
            },
          );
        },
      },
    });
    const malformedSession = await malformed.manager.create({
      cwd: process.cwd(),
    });
    await expect(
      malformed.manager.changeEffort(malformedSession.id, "custom"),
    ).rejects.toMatchObject({
      outcome: "unknown",
      message: "lifecycle operation failed",
    });
  });
});
