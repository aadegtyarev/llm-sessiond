import { HarnessRegistry } from "../core/adapter-registry.js";
import { DurableSessionManager } from "../core/durable-session-manager.js";
import type { LifecycleExecutionFactory } from "../core/lifecycle-execution.js";
import type { DurableSessionStore } from "../core/session-manager-store.js";
import type { OwnerGeneration } from "../persistence/session-record.js";
import type { HarnessAdapter } from "../core/adapter-contracts.js";
import type { ProcessProvider } from "../core/ports.js";
import { TrackedLifecycleFactory } from "./tracked-lifecycle-factory.js";
export function createDurableRuntime(input: {
  store: DurableSessionStore;
  owner: OwnerGeneration;
  bindings: Array<{
    adapter: HarnessAdapter;
    factory: LifecycleExecutionFactory;
  }>;
  defaultId?: string;
  providers?: ProcessProvider[];
  id?: () => string;
  stopTimeoutMs?: number;
}) {
  const registry = new HarnessRegistry(
    input.bindings.map(({ adapter }) => adapter),
    input.defaultId,
  );
  const factory = new TrackedLifecycleFactory(input.bindings);
  const manager = new DurableSessionManager(
    input.store,
    registry,
    factory,
    input.owner,
    input.id,
    input.stopTimeoutMs,
  );
  return {
    registry,
    manager,
    async shutdown(): Promise<void> {
      let failed = false;
      try {
        await manager.shutdownOwned();
      } catch {
        failed = true;
      }
      for (const provider of input.providers ?? []) {
        try {
          await provider.shutdown?.();
        } catch {
          failed = true;
        }
      }
      try {
        factory.assertStopped();
      } catch {
        failed = true;
      }
      if (failed) throw new Error("RUNTIME_SHUTDOWN_UNCONFIRMED");
    },
  };
}
