import { HarnessRegistry } from "../src/core/adapter-registry.js";
import { DurableSessionManager } from "../src/core/durable-session-manager.js";
import type { HarnessAdapter } from "../src/core/adapter-contracts.js";
import type { LifecycleExecution } from "../src/core/lifecycle-execution.js";
import type { OwnerGeneration } from "../src/persistence/session-record.js";
import { MemoryStore } from "./durable-memory-store.js";
export const synthetic: HarnessAdapter = {
  descriptor: {
    id: "synthetic",
    aliases: ["third"],
    capabilities: ["harness.launch", "harness.resume", "harness.stop"],
  },
  checkpoint: { namespace: "synthetic.audit", version: 3 },
  validateCheckpoint: (value) =>
    !!value && typeof value === "object" && !Array.isArray(value),
  isResumable: () => true,
};
export const checkpoint = (cursor: number) => ({
  namespace: "synthetic.audit",
  version: 3,
  data: { cursor },
});
export function setup(
  overrides: Partial<LifecycleExecution> & {
    factory?: () => LifecycleExecution;
    id?: () => string;
    timeout?: number;
    inputTimeout?: number;
    adapter?: HarnessAdapter;
    owner?: OwnerGeneration;
  } = {},
) {
  const store = new MemoryStore();
  const calls: string[] = [];
  const execution = () => ({
    launch: async (input: Parameters<LifecycleExecution["launch"]>[0]) => {
      calls.push(`launch:${store.rows.values().next().value?.status}`);
      return overrides.launch
        ? overrides.launch(input)
        : { nativeSessionId: "native", checkpoint: checkpoint(4) };
    },
    resume:
      overrides.resume ??
      (async ({ cwd, options, checkpoint: saved, nativeSessionId }) => {
        calls.push(
          JSON.stringify({ cwd, options, checkpoint: saved, nativeSessionId }),
        );
        return {
          nativeSessionId: "native-2",
          checkpoint: { ...saved!, data: { cursor: 5 } },
        };
      }),
    stop:
      overrides.stop ??
      (async () => {
        calls.push("stop");
      }),
  });
  const manager = new DurableSessionManager(
    store,
    new HarnessRegistry([overrides.adapter ?? synthetic], "third"),
    { create: overrides.factory ?? execution },
    overrides.owner ?? { token: "test-owner", generation: 1 },
    overrides.id ?? (() => "session-1"),
    overrides.timeout ?? 25,
    overrides.inputTimeout ?? 5000,
  );
  return { manager, store, calls };
}
