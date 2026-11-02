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
import { snapshotModelCatalog, type ModelCatalog } from "./model-catalog.js";

export async function readDurableModelCatalog(
  context: DurableManagerContext,
  id: string,
): Promise<ModelCatalog> {
  assertCurrentOwner(context);
  const session = context.store.get(id);
  if (!session) throw new ControlPlaneError("NOT_FOUND");
  if (session.status !== "running")
    throw new ControlPlaneError("SESSION_NOT_RUNNING");
  const adapter = resolveAdapter(context.registry, session.harnessId);
  requireCapability(adapter, "models.read");
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
  let port: LifecycleExecution["modelCatalog"];
  let read: (() => Promise<unknown>) | undefined;
  try {
    port = execution.modelCatalog;
    if (port) read = port.readModelCatalog;
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
  let result: ModelCatalog;
  try {
    result = snapshotModelCatalog(await Reflect.apply(read, port, []));
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
