import { describe, expect, it } from "vitest";
import type { EffortChangeCallContext } from "../src/core/effort-change-port.js";
import type { LifecycleExecution } from "../src/core/lifecycle-execution.js";
import { setup, synthetic } from "./durable-manager-support.js";

describe("durable effort change fences", () => {
  it.each(["stop", "shutdown"] as const)(
    "rechecks %s intent after port getter reentrancy before dispatch",
    async (action) => {
      const adapter = {
        ...synthetic,
        descriptor: {
          ...synthetic.descriptor,
          capabilities: [...synthetic.descriptor.capabilities, "effort.change"],
        },
      };
      const managerRef: { current?: ReturnType<typeof setup>["manager"] } = {};
      let stopRequest: Promise<unknown> | undefined;
      let writes = 0;
      const execution: LifecycleExecution = {
        launch: async () => ({
          nativeSessionId: "native",
          checkpoint: {
            namespace: "synthetic.audit",
            version: 3,
            data: { cursor: 1 },
          },
        }),
        resume: async () => ({ nativeSessionId: "native" }),
        stop: async () => {},
      };
      Object.defineProperty(execution, "effortChange", {
        get: () => {
          stopRequest ??=
            action === "stop"
              ? managerRef.current!.stop("session-1")
              : managerRef.current!.shutdownOwned();
          return {
            changeEffort: async (
              _level: string,
              context: EffortChangeCallContext,
            ) => {
              writes += 1;
              context.beforeMutationWrite();
              return { outcome: "applied" };
            },
          };
        },
      });
      const configured = setup({ adapter, factory: () => execution });
      managerRef.current = configured.manager;
      const manager = configured.manager;
      const session = await manager.create({ cwd: process.cwd() });
      await expect(
        manager.changeEffort(session.id, "exact"),
      ).rejects.toMatchObject({
        code: "SESSION_UNAVAILABLE",
        outcome: "not-applied",
      });
      await stopRequest;
      expect(writes).toBe(0);
      expect(manager.get(session.id).status).toBe("stopped");
    },
  );
});
