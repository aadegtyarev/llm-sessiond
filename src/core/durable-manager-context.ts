import type { HarnessRegistry } from "./adapter-registry.js";
import type {
  LifecycleExecution,
  LifecycleExecutionFactory,
} from "./lifecycle-execution.js";
import type { DurableSessionStore } from "./session-manager-store.js";
import type { OwnerGeneration } from "../persistence/session-record.js";
export interface DurableManagerContext {
  store: DurableSessionStore;
  registry: HarnessRegistry;
  factory: LifecycleExecutionFactory;
  owner: OwnerGeneration;
  owned: Map<string, LifecycleExecution>;
  stopTimeoutMs: number;
}
