import { ControlPlaneError } from "./control-plane-error.js";
import type { DurableManagerContext } from "./durable-manager-context.js";
import type { JsonValue } from "./generic-json.js";
import { validateJson } from "./json-bounds.js";
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
  const adapter = resolveAdapter(context.registry, input.harnessId);
  requireCapability(adapter, "harness.launch");
  if (context.store.get(id))
    throw new ControlPlaneError("SESSION_ID_COLLISION");
  try {
    if (input.options !== undefined) validateJson(input.options, 8192, 5);
  } catch {
    throw new ControlPlaneError("INVALID_OPTIONS");
  }
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
  context.store.create(row);
  let execution: LifecycleExecution;
  let result: LifecycleLaunchResult;
  try {
    execution = context.factory.create(adapter);
    result = await execution.launch({
      cwd: row.cwd,
      ...(row.adapterOptions !== undefined
        ? { options: row.adapterOptions }
        : {}),
    });
  } catch {
    markFailed(context, id, "LAUNCH_FAILED");
    return DurableSessionManagerRead.get(context.store, id);
  }
  let savedCheckpoint;
  try {
    savedCheckpoint = checkedCheckpoint(adapter, result.checkpoint);
  } catch {
    markFailed(context, id, "LAUNCH_FAILED");
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
