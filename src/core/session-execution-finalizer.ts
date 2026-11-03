import { ControlPlaneError } from "./control-plane-error.js";
import type { DurableManagerContext } from "./durable-manager-context.js";
import type { LifecycleExecution } from "./lifecycle-execution.js";
import type { DurableSession } from "../persistence/session-record.js";
import { boundedExecutionStop } from "./bounded-execution-stop.js";
import { persistFinalization } from "./finalization-store.js";
export async function finalizeExecutionFailure(
  context: DurableManagerContext,
  row: DurableSession,
  execution: LifecycleExecution | undefined,
  reason: "LAUNCH_FAILED" | "RESUME_FAILED",
): Promise<void> {
  if (execution) context.executionEvents.markStopping(row.id, execution);
  const stopped =
    execution === undefined
      ? true
      : (await boundedExecutionStop(context, execution)).stopped;
  const at = new Date().toISOString();
  const pending = {
    status: "failed" as const,
    reason,
    at,
    ...(execution ? { execution } : {}),
    stopRequired: !stopped,
  };
  context.pending.set(row.id, pending);
  if (execution) context.owned.set(row.id, execution);
  if (stopped && execution) {
    context.inputState.confirmExecution(row.id, execution);
    context.executionEvents.close(row.id);
  }
  if (!stopped) {
    if (
      !persistFinalization(
        context,
        row.id,
        "uncertain",
        "OPERATION_FAILED",
        at,
        row,
      )
    )
      throw new ControlPlaneError("STALE_OWNER");
    return;
  }
  const written = persistFinalization(
    context,
    row.id,
    "failed",
    reason,
    at,
    row,
  );
  if (!written) {
    if (stopped) {
      context.owned.delete(row.id);
      context.pending.delete(row.id);
    }
    throw new ControlPlaneError("STALE_OWNER");
  }
  if (stopped) {
    context.owned.delete(row.id);
    context.pending.delete(row.id);
  }
}
