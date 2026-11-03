import type { HarnessRegistry } from "./adapter-registry.js";
import type { LifecycleExecutionFactory } from "./lifecycle-execution.js";
import type { DurableSessionStore } from "./session-manager-store.js";
import type { OwnerGeneration } from "../persistence/session-record.js";
import { assertCurrentOwner } from "./session-lifecycle-support.js";
import { hasLifecycleIntent } from "./durable-lifecycle-intents.js";
import { DurableSessionEvents } from "./durable-session-events.js";
import { ExecutionEventSources } from "./execution-event-sources.js";
import { DurableInputState } from "./durable-input-state.js";
import { SafeSessionStore } from "./safe-session-store.js";
import type { DurableManagerContext } from "./durable-manager-context.js";

export function createManagerObservation(
  store: DurableSessionStore,
  registry: HarnessRegistry,
  factory: LifecycleExecutionFactory,
  owner: OwnerGeneration,
  stopTimeoutMs: number,
): { context: DurableManagerContext; events: DurableSessionEvents } {
  const events = new DurableSessionEvents(store, owner);
  const inputState = new DurableInputState();
  const contextRef: { current?: DurableManagerContext } = {};
  const executionEvents = new ExecutionEventSources(
    events,
    (sessionId, execution) => {
      const context = contextRef.current;
      if (!context) return false;
      try {
        assertCurrentOwner(context);
        return (
          !context.executionAdmissionClosed &&
          !hasLifecycleIntent(context, sessionId) &&
          context.owned.get(sessionId) === execution
        );
      } catch {
        return false;
      }
    },
  );
  const context: DurableManagerContext = {
    store: new SafeSessionStore(store, (id, deleted, snapshot) =>
      events.commitSession(id, deleted, snapshot),
    ),
    registry,
    factory,
    owner,
    owned: new Map(),
    pending: new Map(),
    lifecycleIntents: new Map(),
    stopTimeoutMs,
    inputState,
    events,
    executionEvents,
    executionAdmissionClosed: false,
  };
  contextRef.current = context;
  inputState.subscribe((event) => events.publishInput(event));
  return { context, events };
}
