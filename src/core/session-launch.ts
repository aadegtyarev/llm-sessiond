import { ControlPlaneError } from "./control-plane-error.js";
import type { DurableManagerContext } from "./durable-manager-context.js";
import type { JsonValue } from "./generic-json.js";
import { validateJson } from "./json-bounds.js";
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
import type {
  LifecycleExecution,
  LifecycleLaunchResult,
} from "./lifecycle-execution.js";
import { finalizeExecutionFailure } from "./session-execution-finalizer.js";
export async function createSession(
  context: DurableManagerContext,
  id: string,
  input: {
    cwd: string;
    harnessId?: string;
    name?: string;
    options?: JsonValue;
  },
): Promise<DurableSession> {
  assertExecutionAdmissionOpen(context);
  const adapter = resolveAdapter(context.registry, input.harnessId);
  requireCapability(adapter, "harness.launch");
  if (context.store.get(id) || context.owned.has(id) || context.pending.has(id))
    throw new ControlPlaneError("SESSION_ID_COLLISION");
  try {
    if (input.options !== undefined) validateJson(input.options, 8192, 5);
  } catch {
    throw new ControlPlaneError("INVALID_OPTIONS");
  }
  assertExecutionAdmissionOpen(context);
  const row: DurableSession = {
    id,
    harnessId: adapter.descriptor.id,
    cwd: input.cwd,
    status: "starting",
    createdAt: new Date().toISOString(),
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.options !== undefined ? { adapterOptions: input.options } : {}),
  };
  assertCurrentOwner(context);
  assertExecutionAdmissionOpen(context);
  context.store.create(row);
  let execution: LifecycleExecution | undefined;
  let result: LifecycleLaunchResult;
  try {
    execution = context.factory.create(adapter);
    context.owned.set(id, execution);
    context.inputState.trackExecution(id, execution);
    const launch = execution.launch;
    assertExecutionAdmissionOpen(context);
    result = await launch.call(execution, {
      cwd: row.cwd,
      ...(row.adapterOptions !== undefined
        ? { options: row.adapterOptions }
        : {}),
    });
  } catch {
    await finalizeExecutionFailure(context, row, execution, "LAUNCH_FAILED");
    return DurableSessionManagerRead.get(context.store, id);
  }
  if (context.executionAdmissionClosed) {
    await finalizeExecutionFailure(context, row, execution, "LAUNCH_FAILED");
    return DurableSessionManagerRead.get(context.store, id);
  }
  let capturedResult;
  try {
    capturedResult = captureLifecycleResult(adapter, row, result);
  } catch {
    await finalizeExecutionFailure(context, row, execution, "LAUNCH_FAILED");
    return DurableSessionManagerRead.get(context.store, id);
  }
  try {
    assertExecutionAdmissionOpen(context);
    markRunning(context, row, execution!, capturedResult);
  } catch {
    await finalizeExecutionFailure(context, row, execution, "LAUNCH_FAILED");
    throw new ControlPlaneError("OPERATION_FAILED");
  }
  return DurableSessionManagerRead.get(context.store, id);
}
