import { describe, expect, it, vi } from "vitest";
import type { LifecycleExecution } from "../src/core/lifecycle-execution.js";
import { setup } from "./durable-manager-support.js";
import { internals, statusAdapter } from "./durable-live-status-support.js";

describe("port accessor dispatch fences", () => {
  it("rechecks after port getters invalidate terminal or source generation", async () => {
    for (const invalidation of ["terminal", "generation"] as const) {
      let emit!: (event: unknown) => void;
      let sessionId = "";
      let execution!: LifecycleExecution;
      const readLiveStatus = vi.fn(async () => ({ effort: "high" }));
      const inputs = {
        submit: async () => ({ kind: "accepted" as const }),
        cancel: async () => ({ kind: "accepted" as const }),
        subscribe: (listener: (event: unknown) => void) => {
          emit = listener;
          return () => {};
        },
      };
      const factory = () => {
        execution = {
          inputs,
          get liveStatus() {
            if (invalidation === "terminal") emit({ kind: "execution-ended" });
            else
              internals(manager).context.inputState.trackExecution(
                sessionId,
                execution,
              );
            return { readLiveStatus };
          },
          launch: async () => ({}),
          resume: async () => ({}),
          stop: async () => {},
        };
        return execution;
      };
      const manager = setup({ adapter: statusAdapter, factory }).manager;
      const session = await manager.create({ cwd: process.cwd() });
      sessionId = session.id;
      await expect(manager.readLiveStatus(session.id)).rejects.toMatchObject({
        code: "SESSION_UNAVAILABLE",
      });
      expect(readLiveStatus).not.toHaveBeenCalled();
      await manager.stop(session.id);
    }
  });
});
