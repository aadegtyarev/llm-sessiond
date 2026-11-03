import type { HarnessRegistry } from "./adapter-registry.js";
import type {
  LifecycleExecution,
  LifecycleExecutionFactory,
} from "./lifecycle-execution.js";
import type { DurableSessionStore } from "./session-manager-store.js";
import type { OwnerGeneration } from "../persistence/session-record.js";
import type { PendingFinalization } from "./pending-finalization.js";
import type { DurableInputState } from "./durable-input-state.js";
import type { DurableSessionEvents } from "./durable-session-events.js";
import type { ExecutionEventSources } from "./execution-event-sources.js";
export interface DurableManagerContext {
  store: DurableSessionStore;
  registry: HarnessRegistry;
  factory: LifecycleExecutionFactory;
  owner: OwnerGeneration;
  owned: Map<string, LifecycleExecution>;
  pending: Map<string, PendingFinalization>;
  lifecycleIntents: Map<string, Set<object>>;
  stopTimeoutMs: number;
  inputState: DurableInputState;
  events: DurableSessionEvents;
  executionEvents: ExecutionEventSources;
  executionAdmissionClosed: boolean;
}
