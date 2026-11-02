import type { LifecycleExecution } from "./lifecycle-execution.js";
import { ControlPlaneError } from "./control-plane-error.js";
import type { DurableManagerContext } from "./durable-manager-context.js";
import {
  assertCurrentOwner,
  requireCapability,
  resolveAdapter,
} from "./session-lifecycle-support.js";
import { hasLifecycleIntent } from "./durable-lifecycle-intents.js";
import { assertLiveStatusQueryCurrent } from "./live-status-query-fence.js";
import { snapshotEffortCatalog, type EffortCatalog } from "./effort-catalog.js";

export async function readDurableEffortCatalog(
  context: DurableManagerContext,
  id: string,
): Promise<EffortCatalog> {
  assertCurrentOwner(context);
  const session = context.store.get(id);
  if (!session) throw new ControlPlaneError("NOT_FOUND");
  if (session.status !== "running")
    throw new ControlPlaneError("SESSION_NOT_RUNNING");
  const adapter = resolveAdapter(context.registry, session.harnessId);
  requireCapability(adapter, "effort.read");
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
  const generation = source.generation;
  let port: LifecycleExecution["effortCatalog"];
  let read: (() => Promise<unknown>) | undefined;
  try {
    port = execution.effortCatalog;
    if (port) read = port.readEffortCatalog;
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
    generation,
  );
  let result: EffortCatalog;
  try {
    result = snapshotEffortCatalog(await Reflect.apply(read, port, []));
  } catch {
    throw new ControlPlaneError("OPERATION_FAILED");
  }
  assertLiveStatusQueryCurrent(
    context,
    id,
    session,
    execution,
    source,
    generation,
  );
  return result;
}
