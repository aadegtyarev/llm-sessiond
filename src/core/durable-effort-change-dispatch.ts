import { EffortChangeError } from "./effort-change-error.js";
import type { DurableManagerContext } from "./durable-manager-context.js";
import type { LifecycleExecution } from "./lifecycle-execution.js";
import type { EffortChangeCallContext } from "./effort-change-port.js";
import { createEffortChangeFence } from "./durable-effort-change-fence.js";
import { readEffortChangeOutcome } from "./effort-change-result.js";
import {
  assertCurrentOwner,
  requireCapability,
  resolveAdapter,
} from "./session-lifecycle-support.js";

export async function dispatchDurableEffortChange(
  manager: DurableManagerContext,
  id: string,
  level: string,
  deadline: number,
  isActive: () => boolean,
  markMutationPossible: () => void,
  mutationPossible: () => boolean,
): Promise<{ outcome: "applied" }> {
  assertCurrentOwner(manager);
  const session = manager.store.get(id);
  if (!session) throw new EffortChangeError("NOT_FOUND", "not-applied");
  if (session.status !== "running")
    throw new EffortChangeError("SESSION_NOT_RUNNING", "not-applied");
  const adapter = resolveAdapter(manager.registry, session.harnessId);
  requireCapability(adapter, "effort.change");
  const execution = manager.owned.get(id);
  if (!execution)
    throw new EffortChangeError("SESSION_UNAVAILABLE", "not-applied");
  const source = manager.inputState.source(id, execution);
  if (
    !source ||
    !source.executionLive ||
    source.stopping ||
    !manager.inputState.sourceIsCurrent(source)
  )
    throw new EffortChangeError("SESSION_UNAVAILABLE", "not-applied");
  const generation = source.generation;
  let port: LifecycleExecution["effortChange"];
  let change:
    | ((level: string, context: EffortChangeCallContext) => Promise<unknown>)
    | undefined;
  try {
    port = execution.effortChange;
    if (port) change = port.changeEffort;
  } catch {
    throw new EffortChangeError("OPERATION_FAILED", "not-applied");
  }
  if (!port || typeof change !== "function")
    throw new EffortChangeError("SESSION_UNAVAILABLE", "not-applied");
  const callContext = createEffortChangeFence(
    manager,
    session,
    execution,
    source,
    generation,
    deadline,
    isActive,
    markMutationPossible,
  );
  if (!callContext.isCurrent())
    throw new EffortChangeError("SESSION_UNAVAILABLE", "not-applied");
  let result: unknown;
  try {
    result = await Reflect.apply(change, port, [level, callContext]);
  } catch {
    throw new EffortChangeError(
      "OPERATION_FAILED",
      mutationPossible() ? "unknown" : "not-applied",
    );
  }
  if (!callContext.isCurrent())
    throw new EffortChangeError(
      "SESSION_UNAVAILABLE",
      mutationPossible() ? "unknown" : "not-applied",
    );
  const outcome = readEffortChangeOutcome(result);
  if (!callContext.isCurrent())
    throw new EffortChangeError(
      "SESSION_UNAVAILABLE",
      mutationPossible() ? "unknown" : "not-applied",
    );
  if (outcome === "not-applied" && !mutationPossible())
    throw new EffortChangeError("OPERATION_FAILED", "not-applied");
  if (outcome !== "applied" || !mutationPossible())
    throw new EffortChangeError("OPERATION_FAILED", "unknown");
  return { outcome: "applied" };
}
