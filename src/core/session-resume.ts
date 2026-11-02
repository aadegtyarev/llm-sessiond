import { validateCheckpoint } from "./adapter-checkpoint.js";
import { ControlPlaneError } from "./control-plane-error.js";
import type { DurableManagerContext } from "./durable-manager-context.js";
import { DurableSessionManagerRead } from "./session-read-metadata.js";
import {
  assertCurrentOwner,
  assertExecutionAdmissionOpen,
  captureLifecycleResult,
  markRunning,
  requireCapability,
  resolveAdapter,
} from "./session-lifecycle-support.js";
import type { DurableSession } from "../persistence/session-record.js";
import type { LifecycleExecution } from "./lifecycle-execution.js";
import type { LifecycleLaunchResult } from "./lifecycle-execution.js";
import { finalizeExecutionFailure } from "./session-execution-finalizer.js";
export async function resumeSession(
  context: DurableManagerContext,
  id: string,
  preparedExecution?: LifecycleExecution,
): Promise<DurableSession> {
  assertExecutionAdmissionOpen(context);
  const row = DurableSessionManagerRead.get(context.store, id);
  if (context.owned.has(id) || context.pending.has(id))
    throw new ControlPlaneError("SESSION_UNAVAILABLE");
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
  if (row.status === "failed") {
    let resumable = false;
    try {
      resumable = !!checkpoint && !!adapter.isResumable?.(checkpoint);
    } catch {
      throw new ControlPlaneError("OPERATION_FAILED");
    }
    if (!resumable) throw new ControlPlaneError("SESSION_NOT_RESUMABLE");
  }
  if (adapter.checkpoint && !checkpoint)
    throw new ControlPlaneError("UNKNOWN_CHECKPOINT");
  assertCurrentOwner(context);
  assertExecutionAdmissionOpen(context);
  context.store.setStatus(
    id,
    "starting",
    row.failureReason ?? null,
    row.failedAt ?? null,
  );
  let execution: LifecycleExecution | undefined = preparedExecution,
    result: LifecycleLaunchResult;
  try {
    execution ??= context.factory.create(adapter);
    context.owned.set(id, execution);
    context.inputState.trackExecution(id, execution);
    const resume = execution.resume;
    assertExecutionAdmissionOpen(context);
    result = await resume.call(execution, {
      cwd: row.cwd,
      ...(row.adapterOptions !== undefined
        ? { options: row.adapterOptions }
        : {}),
      ...(checkpoint ? { checkpoint } : {}),
      ...(row.nativeSessionId ? { nativeSessionId: row.nativeSessionId } : {}),
    });
  } catch {
    await finalizeExecutionFailure(context, row, execution, "RESUME_FAILED");
    return DurableSessionManagerRead.get(context.store, id);
  }
  let capturedResult;
  try {
    capturedResult = captureLifecycleResult(adapter, row, result);
  } catch {
    await finalizeExecutionFailure(context, row, execution, "RESUME_FAILED");
    return DurableSessionManagerRead.get(context.store, id);
  }
  try {
    assertExecutionAdmissionOpen(context);
    markRunning(context, row, execution!, capturedResult);
  } catch {
    await finalizeExecutionFailure(context, row, execution, "RESUME_FAILED");
    throw new ControlPlaneError("OPERATION_FAILED");
  }
  return DurableSessionManagerRead.get(context.store, id);
}
