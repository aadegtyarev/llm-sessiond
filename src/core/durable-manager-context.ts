import type { HarnessRegistry } from "./adapter-registry.js";
import type {
  LifecycleExecution,
  LifecycleExecutionFactory,
} from "./lifecycle-execution.js";
import type { DurableSessionStore } from "./session-manager-store.js";
import type { OwnerGeneration } from "../persistence/session-record.js";
import type { PendingFinalization } from "./pending-finalization.js";
import type { DurableInputState } from "./durable-input-state.js";
export interface DurableManagerContext {
  store: DurableSessionStore;
  registry: HarnessRegistry;
  factory: LifecycleExecutionFactory;
  owner: OwnerGeneration;
  owned: Map<string, LifecycleExecution>;
  pending: Map<string, PendingFinalization>;
  stopTimeoutMs: number;
  inputState: DurableInputState;
}
