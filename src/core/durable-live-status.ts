import { ControlPlaneError } from "./control-plane-error.js";
import type { DurableManagerContext } from "./durable-manager-context.js";
import {
  assertCurrentOwner,
  requireCapability,
  resolveAdapter,
} from "./session-lifecycle-support.js";
import { validateLiveStatus } from "./live-status-validation.js";
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
  const execution = context.owned.get(id);
  const port = execution?.liveStatus;
  if (!execution || !port) throw new ControlPlaneError("SESSION_UNAVAILABLE");
  const result = await port.readLiveStatus().catch(() => {
    throw new ControlPlaneError("OPERATION_FAILED");
  });
  assertCurrentOwner(context);
  const current = context.store.get(id);
  if (
    context.owned.get(id) !== execution ||
    !current ||
    current.status !== "running" ||
    current.harnessId !== session.harnessId ||
    current.nativeSessionId !== session.nativeSessionId
  )
    throw new ControlPlaneError("SESSION_UNAVAILABLE");
  return validateLiveStatus(result);
}
