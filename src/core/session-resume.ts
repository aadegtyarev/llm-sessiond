import { validateCheckpoint } from "./adapter-checkpoint.js";
import { ControlPlaneError } from "./control-plane-error.js";
import type { DurableManagerContext } from "./durable-manager-context.js";
import { DurableSessionManagerRead } from "./session-read-metadata.js";
import {
  assertCurrentOwner,
  checkedCheckpoint,
  markFailed,
  markRunning,
  requireCapability,
  resolveAdapter,
} from "./session-lifecycle-support.js";
import type { DurableSession } from "../persistence/session-record.js";
import type {
  LifecycleExecution,
  LifecycleLaunchResult,
} from "./lifecycle-execution.js";
export async function resumeSession(
  context: DurableManagerContext,
  id: string,
): Promise<DurableSession> {
  const row = DurableSessionManagerRead.get(context.store, id);
  if (row.status !== "stopped" && row.status !== "failed")
    throw new ControlPlaneError("SESSION_NOT_RESUMABLE");
  const adapter = resolveAdapter(context.registry, row.harnessId);
  requireCapability(adapter, "harness.resume");
  let checkpoint;
  try {
    checkpoint = row.adapterState
      ? validateCheckpoint(row.adapterState, adapter)
      : undefined;
  } catch {
    throw new ControlPlaneError("UNKNOWN_CHECKPOINT");
  }
  if (
    row.status === "failed" &&
    (!checkpoint || !adapter.isResumable?.(checkpoint))
  )
    throw new ControlPlaneError("SESSION_NOT_RESUMABLE");
  if (adapter.checkpoint && !checkpoint)
    throw new ControlPlaneError("UNKNOWN_CHECKPOINT");
  assertCurrentOwner(context);
  context.store.setStatus(
    id,
    "starting",
    row.failureReason ?? null,
    row.failedAt ?? null,
  );
  let execution: LifecycleExecution;
  let result: LifecycleLaunchResult;
  try {
    execution = context.factory.create(adapter);
    result = await execution.resume({
      ...(checkpoint ? { checkpoint } : {}),
      ...(row.nativeSessionId ? { nativeSessionId: row.nativeSessionId } : {}),
    });
  } catch {
    markFailed(context, id, "RESUME_FAILED");
    return DurableSessionManagerRead.get(context.store, id);
  }
  let savedCheckpoint;
  try {
    savedCheckpoint = checkedCheckpoint(adapter, result.checkpoint);
  } catch {
    markFailed(context, id, "RESUME_FAILED");
    return DurableSessionManagerRead.get(context.store, id);
  }
  markRunning(
    context,
    row,
    execution,
    result,
    savedCheckpoint ?? row.adapterState,
  );
  return DurableSessionManagerRead.get(context.store, id);
}
