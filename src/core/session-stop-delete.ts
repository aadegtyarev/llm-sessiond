import { ControlPlaneError } from "./control-plane-error.js";
import { boundedExecutionStop } from "./bounded-execution-stop.js";
import { DurableSessionManagerRead } from "./session-read-metadata.js";
import type { DurableManagerContext } from "./durable-manager-context.js";
import {
  assertCurrentOwner,
  requireCapability,
  resolveAdapter,
} from "./session-lifecycle-support.js";

export async function stopSession(
  context: DurableManagerContext,
  id: string,
): Promise<void> {
  assertCurrentOwner(context);
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
  if (!result.stopped) {
    assertCurrentOwner(context);
    context.store.setStatus(
      id,
      "uncertain",
      "STOP_FAILED",
      new Date().toISOString(),
    );
    throw new ControlPlaneError(
      result.timedOut ? "OPERATION_TIMEOUT" : "OPERATION_FAILED",
    );
  }
  assertCurrentOwner(context);
  context.owned.delete(id);
  context.store.setStatus(id, "stopped");
}
export async function shutdownOwnedExecution(
  context: DurableManagerContext,
  id: string,
): Promise<void> {
  const execution = context.owned.get(id);
  if (!execution) return;
  const result = await boundedExecutionStop(context, execution);
  if (result.stopped) context.owned.delete(id);
  try {
    assertCurrentOwner(context);
    context.store.setStatus(
      id,
      result.stopped ? "stopped" : "uncertain",
      result.stopped ? null : "STOP_FAILED",
      result.stopped ? null : new Date().toISOString(),
    );
  } catch {
    /* shutdown cleanup must not overwrite another owner's row */
  }
}
export function deleteSession(
  context: DurableManagerContext,
  id: string,
): void {
  assertCurrentOwner(context);
  const row = DurableSessionManagerRead.get(context.store, id);
  if (row.status !== "stopped" || context.owned.has(id))
    throw new ControlPlaneError("SESSION_NOT_STOPPED");
  context.store.delete(id);
}
