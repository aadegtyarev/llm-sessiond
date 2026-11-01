import { HarnessRegistry } from "../core/adapter-registry.js";
import { DurableSessionManager } from "../core/durable-session-manager.js";
import type { DurableSessionStore } from "../core/session-manager-store.js";
import type { OwnerGeneration } from "../persistence/session-record.js";
import type { ProcessProvider } from "../core/ports.js";
import { NodeProcessProvider } from "../process/node-provider.js";
import { PiLifecycleAdapter } from "./pi-lifecycle-adapter.js";
import { PiLifecycleExecutionFactory } from "./pi-lifecycle-factory.js";

export function createPiDurableRuntime(input: {
  store: DurableSessionStore;
  owner: OwnerGeneration;
  provider?: ProcessProvider;
  id?: () => string;
  stopTimeoutMs?: number;
  readinessTimeoutMs?: number;
}) {
  const provider = input.provider ?? new NodeProcessProvider();
  const adapter = new PiLifecycleAdapter();
  const registry = new HarnessRegistry([adapter], "pi");
  const factory = new PiLifecycleExecutionFactory(
    adapter,
    provider,
    undefined,
    input.readinessTimeoutMs,
  );
  const manager = new DurableSessionManager(
    input.store,
    registry,
    factory,
    input.owner,
    input.id,
    input.stopTimeoutMs,
  );
  return {
    adapter,
    registry,
    manager,
    async shutdown(): Promise<void> {
      await manager.shutdownOwned();
      await provider.shutdown?.();
    },
  };
}
