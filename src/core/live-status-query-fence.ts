import type { DurableManagerContext } from "./durable-manager-context.js";
import type { ExecutionInputSource } from "./execution-input-source.js";
import type { LifecycleExecution } from "./lifecycle-execution.js";
import type { DurableSession } from "../persistence/session-record.js";
import { ControlPlaneError } from "./control-plane-error.js";
import { assertCurrentOwner } from "./session-lifecycle-support.js";
import { hasLifecycleIntent } from "./durable-lifecycle-intents.js";

export function assertLiveStatusQueryCurrent(
  context: DurableManagerContext,
  id: string,
  session: DurableSession,
  execution: LifecycleExecution,
  source: ExecutionInputSource,
  generation: number,
): void {
  assertCurrentOwner(context);
  const current = context.store.get(id);
  if (
    context.pending.has(id) ||
    hasLifecycleIntent(context, id) ||
    context.owned.get(id) !== execution ||
    context.inputState.source(id, execution) !== source ||
    source.generation !== generation ||
    !source.executionLive ||
    source.stopping ||
    !context.inputState.sourceIsCurrent(source) ||
    !current ||
    current.status !== "running" ||
    current.harnessId !== session.harnessId ||
    current.nativeSessionId !== session.nativeSessionId
  ) {
    throw new ControlPlaneError("SESSION_UNAVAILABLE");
  }
}
