import type { ExecutionInputSource } from "./execution-input-source.js";
import { ControlPlaneError } from "./control-plane-error.js";
import type { DurableManagerContext } from "./durable-manager-context.js";
import {
  assertCurrentOwner,
  requireCapability,
  resolveAdapter,
} from "./session-lifecycle-support.js";
import { validateLiveStatus } from "./live-status-validation.js";
import type { LiveStatus } from "./live-status.js";

function isLiveSource(
  context: DurableManagerContext,
  source: ExecutionInputSource,
): boolean {
  return (
    source.executionLive &&
    !source.stopping &&
    context.inputState.sourceIsCurrent(source)
  );
}

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
  if (context.pending.has(id))
    throw new ControlPlaneError("SESSION_UNAVAILABLE");
  const execution = context.owned.get(id);
  if (!execution) throw new ControlPlaneError("SESSION_UNAVAILABLE");
  const source = context.inputState.source(id, execution);
  if (!source || !isLiveSource(context, source))
    throw new ControlPlaneError("SESSION_UNAVAILABLE");
  const sourceGeneration = source.generation;
  let port;
  try {
    port = execution.liveStatus;
  } catch {
    throw new ControlPlaneError("OPERATION_FAILED");
  }
  if (!port) throw new ControlPlaneError("SESSION_UNAVAILABLE");
  let result: LiveStatus;
  try {
    result = validateLiveStatus(await port.readLiveStatus());
  } catch {
    throw new ControlPlaneError("OPERATION_FAILED");
  }
  assertCurrentOwner(context);
  const current = context.store.get(id);
  if (
    context.pending.has(id) ||
    context.owned.get(id) !== execution ||
    context.inputState.source(id, execution) !== source ||
    source.generation !== sourceGeneration ||
    !isLiveSource(context, source) ||
    !current ||
    current.status !== "running" ||
    current.harnessId !== session.harnessId ||
    current.nativeSessionId !== session.nativeSessionId
  )
    throw new ControlPlaneError("SESSION_UNAVAILABLE");
  return result;
}
