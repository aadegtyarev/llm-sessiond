import { describe, expect, it } from "vitest";
import type { LifecycleExecution } from "../src/core/lifecycle-execution.js";
import type { DurableSessionManager } from "../src/core/durable-session-manager.js";
import { setup } from "./durable-manager-support.js";
describe("durable resume factory failure", () => {
  it("marks failed safely when execution construction throws after starting is persisted", async () => {
    let creates = 0;
    let stateAtFailure = "";
    const managerRef: { current?: DurableSessionManager } = {};
    const configured = setup({
      factory: () => {
        creates++;
        if (creates === 2) {
          stateAtFailure = managerRef.current!.get("session-1").status;
          throw new Error("raw construction error");
        }
        const execution: LifecycleExecution = {
          launch: async () => ({
            nativeSessionId: "native",
            checkpoint: { namespace: "synthetic.audit", version: 3, data: {} },
          }),
          resume: async () => ({}),
          stop: async () => {},
        };
        return execution;
      },
    });
    managerRef.current = configured.manager;
    const row = await configured.manager.create({ cwd: process.cwd() });
    await configured.manager.stop(row.id);
    const failed = await configured.manager.resume(row.id);
    expect(stateAtFailure).toBe("starting");
    expect(failed.status).toBe("failed");
    expect(failed.failureReason).toBe("RESUME_FAILED");
    expect(failed.failureReason).not.toContain("raw");
  });
});
