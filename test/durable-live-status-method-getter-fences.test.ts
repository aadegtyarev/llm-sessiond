import { describe, expect, it, vi } from "vitest";
import type { LifecycleExecution } from "../src/core/lifecycle-execution.js";
import { setup } from "./durable-manager-support.js";
import { statusAdapter } from "./durable-live-status-support.js";

describe("captured live-status method fences", () => {
  it("rechecks after method getters invalidate owner or request stop/shutdown", async () => {
    for (const effect of ["owner", "stop", "shutdown"] as const) {
      let stopRequest: Promise<unknown> | undefined;
      let shutdownRequest: Promise<void> | undefined;
      const invoke = vi.fn(async () => ({ effort: "high" }));
      const result = setup({
        adapter: statusAdapter,
        factory: () => {
          const port = {} as NonNullable<LifecycleExecution["liveStatus"]>;
          Object.defineProperty(port, "readLiveStatus", {
            get() {
              if (effect === "owner") result.store.stale = true;
              if (effect === "stop") stopRequest = manager.stop("session-1");
              if (effect === "shutdown")
                shutdownRequest = manager.shutdownOwned();
              return invoke;
            },
          });
          return {
            liveStatus: port,
            launch: async () => ({}),
            resume: async () => ({}),
            stop: async () => {},
          };
        },
      });
      const manager = result.manager;
      const session = await manager.create({ cwd: process.cwd() });
      await expect(manager.readLiveStatus(session.id)).rejects.toMatchObject({
        code: effect === "owner" ? "STALE_OWNER" : "SESSION_UNAVAILABLE",
      });
      expect(invoke).not.toHaveBeenCalled();
      if (stopRequest) await stopRequest;
      if (shutdownRequest) await shutdownRequest;
    }
  });
  it("invokes a captured class method with its original receiver", async () => {
    class StatusPort {
      readonly value = "receiver-preserved";
      async readLiveStatus() {
        return { effort: this.value };
      }
    }
    const liveStatus = new StatusPort();
    const { manager } = setup({ adapter: statusAdapter, liveStatus });
    const session = await manager.create({ cwd: process.cwd() });
    await expect(manager.readLiveStatus(session.id)).resolves.toEqual({
      effort: "receiver-preserved",
    });
  });
});
