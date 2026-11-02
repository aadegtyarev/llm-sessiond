import { describe, expect, it } from "vitest";
import { setup, synthetic } from "./durable-manager-support.js";

const observableAdapter = {
  ...synthetic,
  descriptor: {
    ...synthetic.descriptor,
    capabilities: [
      ...synthetic.descriptor.capabilities,
      "effort.change",
      "effort.read",
      "status.read",
      "usage.read",
    ],
  },
};

describe("durable effort change observability", () => {
  it("keeps read-only queries available while its port is pending", async () => {
    let started!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const configured = setup({
      adapter: observableAdapter,
      effortChange: {
        changeEffort: async (_level, context) => {
          started();
          await gate;
          expect(context.beforeMutationWrite()).toBe(true);
          return { outcome: "applied" };
        },
      },
      liveStatus: { readLiveStatus: async () => ({ effort: "medium" }) },
      effortCatalog: {
        readEffortCatalog: async () => ({ levels: ["low", "high"] }),
      },
    });
    const session = await configured.manager.create({ cwd: process.cwd() });
    const operation = configured.manager.changeEffort(session.id, "custom");
    await entered;
    await expect(
      configured.manager.readLiveStatus(session.id),
    ).resolves.toEqual({
      effort: "medium",
    });
    await expect(
      configured.manager.readEffortCatalog(session.id),
    ).resolves.toEqual({ levels: ["low", "high"] });
    release();
    await expect(operation).resolves.toEqual({ outcome: "applied" });
  });

  it.each(["stop", "shutdown"] as const)(
    "blocks a pending pre-write operation during %s",
    async (lifecycle) => {
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
        adapter: observableAdapter,
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
      const operation = configured.manager.changeEffort(session.id, "custom");
      const rejection = expect(operation).rejects.toMatchObject({
        code: "SESSION_UNAVAILABLE",
        outcome: "not-applied",
      });
      await entered;
      if (lifecycle === "stop") await configured.manager.stop(session.id);
      else await configured.manager.shutdownOwned();
      release();
      await rejection;
      expect(writes).toBe(0);
    },
  );
});
