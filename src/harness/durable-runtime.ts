import { HarnessRegistry } from "../core/adapter-registry.js";
import { DurableSessionManager } from "../core/durable-session-manager.js";
import type {
  LifecycleExecution,
  LifecycleExecutionFactory,
} from "../core/lifecycle-execution.js";
import type { DurableSessionStore } from "../core/session-manager-store.js";
import type { OwnerGeneration } from "../persistence/session-record.js";
import type { HarnessAdapter } from "../core/adapter-contracts.js";
import type { ProcessProvider } from "../core/ports.js";

class RegisteredLifecycleExecutionFactory implements LifecycleExecutionFactory {
  private readonly factories: Map<HarnessAdapter, LifecycleExecutionFactory>;
  constructor(
    bindings: Array<{
      adapter: HarnessAdapter;
      factory: LifecycleExecutionFactory;
    }>,
  ) {
    this.factories = new Map(
      bindings.map(({ adapter, factory }) => [adapter, factory]),
    );
  }
  create(adapter: HarnessAdapter): LifecycleExecution {
    const factory = this.factories.get(adapter);
    if (!factory) throw new Error("UNSUPPORTED_ADAPTER");
    return factory.create(adapter);
  }
}
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
  const manager = new DurableSessionManager(
    input.store,
    registry,
    new RegisteredLifecycleExecutionFactory(input.bindings),
    input.owner,
    input.id,
    input.stopTimeoutMs,
  );
  return {
    registry,
    manager,
    async shutdown(): Promise<void> {
      await manager.shutdownOwned();
      for (const provider of input.providers ?? []) await provider.shutdown?.();
    },
  };
}
