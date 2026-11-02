import type { LifecycleExecution } from "./lifecycle-execution.js";
import { ControlPlaneError } from "./control-plane-error.js";
import type { DurableManagerContext } from "./durable-manager-context.js";
import {
  assertCurrentOwner,
  requireCapability,
  resolveAdapter,
} from "./session-lifecycle-support.js";
import { validateLiveStatus } from "./live-status-validation.js";
import { hasLifecycleIntent } from "./durable-lifecycle-intents.js";
import { assertLiveStatusQueryCurrent } from "./live-status-query-fence.js";
import type { LiveStatus } from "./live-status.js";

export async function readDurableLiveStatus(
  context: DurableManagerContext,
  id: string,
): Promise<LiveStatus> {
  assertCurrentOwner(context);
  const session = context.store.get(id);
  if (!session) throw new ControlPlaneError("NOT_FOUND");
  if (session.status !== "running")
    throw new ControlPlaneError("SESSION_NOT_RUNNING");
  const adapter = resolveAdapter(context.registry, session.harnessId);
  requireCapability(adapter, "status.read");
  requireCapability(adapter, "usage.read");
  if (context.pending.has(id) || hasLifecycleIntent(context, id))
    throw new ControlPlaneError("SESSION_UNAVAILABLE");
  const execution = context.owned.get(id);
  if (!execution) throw new ControlPlaneError("SESSION_UNAVAILABLE");
  const source = context.inputState.source(id, execution);
  if (
    !source ||
    !source.executionLive ||
    source.stopping ||
    !context.inputState.sourceIsCurrent(source)
  )
    throw new ControlPlaneError("SESSION_UNAVAILABLE");
  const sourceGeneration = source.generation;
  let port: LifecycleExecution["liveStatus"];
  let read: (() => Promise<LiveStatus>) | undefined;
  try {
    port = execution.liveStatus;
    if (port) read = port.readLiveStatus;
  } catch {
    throw new ControlPlaneError("OPERATION_FAILED");
  }
  if (!port) throw new ControlPlaneError("SESSION_UNAVAILABLE");
  if (typeof read !== "function")
    throw new ControlPlaneError("OPERATION_FAILED");
  assertLiveStatusQueryCurrent(
    context,
    id,
    session,
    execution,
    source,
    sourceGeneration,
  );
  let result: LiveStatus;
  try {
    result = validateLiveStatus(await Reflect.apply(read, port, []));
  } catch {
    throw new ControlPlaneError("OPERATION_FAILED");
  }
  assertLiveStatusQueryCurrent(
    context,
    id,
    session,
    execution,
    source,
    sourceGeneration,
  );
  return result;
}
