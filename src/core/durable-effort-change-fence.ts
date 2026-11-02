import type { DurableManagerContext } from "./durable-manager-context.js";
import type { LifecycleExecution } from "./lifecycle-execution.js";
import type { DurableSession } from "../persistence/session-record.js";
import type { ExecutionInputSource } from "./execution-input-source.js";
import type { EffortChangeCallContext } from "./effort-change-port.js";
import { assertLiveStatusQueryCurrent } from "./live-status-query-fence.js";

export function createEffortChangeFence(
  manager: DurableManagerContext,
  session: DurableSession,
  execution: LifecycleExecution,
  source: ExecutionInputSource,
  generation: number,
  deadline: number,
  isActive: () => boolean,
  markMutationPossible: () => void,
): EffortChangeCallContext {
  let mutationStarted = false;
  const isCurrent = (): boolean => {
    if (!isActive() || Date.now() >= deadline) return false;
    try {
      assertLiveStatusQueryCurrent(
        manager,
        session.id,
        session,
        execution,
        source,
        generation,
      );
      return true;
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
