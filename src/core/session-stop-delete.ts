import { ControlPlaneError } from "./control-plane-error.js";
import { boundedExecutionStop } from "./bounded-execution-stop.js";
import { DurableSessionManagerRead } from "./session-read-metadata.js";
import type { DurableManagerContext } from "./durable-manager-context.js";
import {
  assertCurrentOwner,
  requireCapability,
  resolveAdapter,
} from "./session-lifecycle-support.js";
import { persistFinalization } from "./finalization-store.js";

export async function stopSession(
  context: DurableManagerContext,
  id: string,
): Promise<void> {
  assertCurrentOwner(context);
  if (context.pending.has(id))
    throw new ControlPlaneError("SESSION_UNAVAILABLE");
  const row = DurableSessionManagerRead.get(context.store, id);
  if (row.status === "stopped") return;
  if (row.status === "uncertain")
    throw new ControlPlaneError("SESSION_UNAVAILABLE");
  if (row.status !== "running")
    throw new ControlPlaneError("SESSION_NOT_RUNNING");
  const adapter = resolveAdapter(context.registry, row.harnessId);
  requireCapability(adapter, "harness.stop");
  const execution = context.owned.get(id);
  if (!execution) throw new ControlPlaneError("SESSION_UNAVAILABLE");
  const result = await boundedExecutionStop(context, execution);
  const at = new Date().toISOString();
  const pending = {
    status: "stopped" as const,
    reason: null,
    at,
    execution,
    stopRequired: !result.stopped,
  };
  context.pending.set(id, pending);
  if (!result.stopped) {
    if (!persistFinalization(context, id, "uncertain", "STOP_FAILED", at))
      throw new ControlPlaneError("STALE_OWNER");
    throw new ControlPlaneError(
      result.timedOut ? "OPERATION_TIMEOUT" : "OPERATION_FAILED",
    );
  }
  pending.stopRequired = false;
  if (!persistFinalization(context, id, "stopped", null, at)) {
    context.owned.delete(id);
    context.pending.delete(id);
    throw new ControlPlaneError("STALE_OWNER");
  }
  context.owned.delete(id);
  context.pending.delete(id);
}
export function deleteSession(
  context: DurableManagerContext,
  id: string,
): void {
  assertCurrentOwner(context);
  const row = DurableSessionManagerRead.get(context.store, id);
  if (
    row.status !== "stopped" ||
    context.owned.has(id) ||
    context.pending.has(id)
  )
    throw new ControlPlaneError("SESSION_NOT_STOPPED");
  context.store.delete(id);
}
