import type { DurableManagerContext } from "./durable-manager-context.js";
import type { LifecycleExecution } from "./lifecycle-execution.js";
import type { DurableSession } from "../persistence/session-record.js";
import type { ExecutionInputSource } from "./execution-input-source.js";
import type { LifecycleIntent } from "./durable-lifecycle-intents.js";
import type { EffortChangeCallContext } from "./effort-change-port.js";

export function createEffortChangeFence(
  manager: DurableManagerContext,
  session: DurableSession,
  execution: LifecycleExecution,
  source: ExecutionInputSource,
  generation: number,
  intent: LifecycleIntent,
  deadline: number,
  isActive: () => boolean,
  markMutationPossible: () => void,
): EffortChangeCallContext {
  let mutationStarted = false;
  const isCurrent = (): boolean => {
    if (!isActive() || Date.now() >= deadline) return false;
    try {
      manager.store.assertOwner(manager.owner);
      const current = manager.store.get(session.id);
      const intents = manager.lifecycleIntents.get(session.id);
      return Boolean(
        current &&
        current.status === "running" &&
        current.harnessId === session.harnessId &&
        current.nativeSessionId === session.nativeSessionId &&
        !manager.pending.has(session.id) &&
        ![...(intents ?? [])].some((token) => token !== intent.token) &&
        manager.owned.get(session.id) === execution &&
        manager.inputState.source(session.id, execution) === source &&
        source.generation === generation &&
        source.executionLive &&
        !source.stopping &&
        manager.inputState.sourceIsCurrent(source),
      );
    } catch {
      return false;
    }
  };
  return Object.freeze({
    ...(session.nativeSessionId === undefined
      ? {}
      : { expectedNativeSessionId: session.nativeSessionId }),
    isCurrent,
    remainingMs: () => Math.max(0, deadline - Date.now()),
    beforeMutationWrite: () => {
      if (mutationStarted || !isCurrent()) return false;
      mutationStarted = true;
      markMutationPossible();
      return true;
    },
  });
}
