import { ControlPlaneError } from "./control-plane-error.js";
import type { DurableManagerContext } from "./durable-manager-context.js";
import { boundedExecutionStop } from "./bounded-execution-stop.js";
import { persistFinalization } from "./finalization-store.js";
export async function shutdownOwnedExecution(
  context: DurableManagerContext,
  id: string,
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
        return false;
      return false;
    }
    pending.stopRequired = false;
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
    return true;
  }
  context.owned.delete(id);
  context.pending.delete(id);
  return true;
}
