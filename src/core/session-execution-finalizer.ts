import type { DurableManagerContext } from "./durable-manager-context.js";
import type { LifecycleExecution } from "./lifecycle-execution.js";
import type { DurableSession } from "../persistence/session-record.js";
import { assertCurrentOwner } from "./session-lifecycle-support.js";
import { boundedExecutionStop } from "./bounded-execution-stop.js";
export async function finalizeExecutionFailure(
  context: DurableManagerContext,
  row: DurableSession,
  execution: LifecycleExecution | undefined,
  reason: "LAUNCH_FAILED" | "RESUME_FAILED",
): Promise<void> {
  const stopped =
    execution === undefined
      ? true
      : (await boundedExecutionStop(context, execution)).stopped;
  if (stopped) context.owned.delete(row.id);
  try {
    assertCurrentOwner(context);
    context.store.setStatus(
      row.id,
      stopped ? "failed" : "uncertain",
      stopped ? reason : "OPERATION_FAILED",
      new Date().toISOString(),
    );
  } catch {
    /* stale or unavailable owner must not overwrite durable state */
  }
}
