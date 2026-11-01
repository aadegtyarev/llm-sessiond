import { ControlPlaneError } from "./control-plane-error.js";
import type { DurableManagerContext } from "./durable-manager-context.js";
import { boundedExecutionStop } from "./bounded-execution-stop.js";
import { persistFinalization } from "./finalization-store.js";
export async function shutdownOwnedExecution(
  context: DurableManagerContext,
  id: string,
  onStopped?: (
    id: string,
    execution: import("./lifecycle-execution.js").LifecycleExecution,
  ) => void,
): Promise<boolean> {
  let pending = context.pending.get(id);
  const execution = context.owned.get(id);
  if (!pending) {
    if (!execution) return true;
    pending = {
      status: "stopped",
      reason: null,
      at: new Date().toISOString(),
      execution,
      stopRequired: true,
    };
    context.pending.set(id, pending);
  }
  if (pending.stopRequired) {
    if (!execution) throw new ControlPlaneError("SESSION_UNAVAILABLE");
    const stopped = await boundedExecutionStop(context, execution);
    if (!stopped.stopped) {
      if (
        !persistFinalization(
          context,
          id,
          "uncertain",
          "STOP_FAILED",
          new Date().toISOString(),
        )
      )
        throw new ControlPlaneError("STALE_OWNER");
      return false;
    }
    pending.stopRequired = false;
    onStopped?.(id, execution);
  }
  const written = persistFinalization(
    context,
    id,
    pending.status,
    pending.reason,
    pending.at,
  );
  if (!written) {
    context.owned.delete(id);
    context.pending.delete(id);
    throw new ControlPlaneError("STALE_OWNER");
  }
  context.owned.delete(id);
  context.pending.delete(id);
  return true;
}
