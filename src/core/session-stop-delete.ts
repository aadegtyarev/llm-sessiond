import { ControlPlaneError } from "./control-plane-error.js";
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
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      execution.stop(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new ControlPlaneError("OPERATION_TIMEOUT")),
          context.stopTimeoutMs,
        );
      }),
    ]);
    assertCurrentOwner(context);
    context.owned.delete(id);
    context.store.setStatus(id, "stopped");
  } catch (error) {
    assertCurrentOwner(context);
    context.store.setStatus(
      id,
      "uncertain",
      "STOP_FAILED",
      new Date().toISOString(),
    );
    if (
      error instanceof ControlPlaneError &&
      error.code === "OPERATION_TIMEOUT"
    )
      throw error;
    throw new ControlPlaneError("OPERATION_FAILED");
  } finally {
    if (timer) clearTimeout(timer);
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
