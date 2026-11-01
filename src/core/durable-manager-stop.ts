import { ControlPlaneError } from "./control-plane-error.js";
import type { DurableManagerContext } from "./durable-manager-context.js";
import type { PerSessionLock } from "./per-session-lock.js";
import { DurableSessionManagerRead } from "./session-read-metadata.js";
import { stopSession } from "./session-stop-delete.js";
import { assertCurrentOwner } from "./session-lifecycle-support.js";

export function stopManagedSession(
  context: DurableManagerContext,
  locks: PerSessionLock,
  id: string,
) {
  return locks.run(id, async () => {
    const row = DurableSessionManagerRead.get(context.store, id);
    assertCurrentOwner(context);
    if (row.status === "running" && !context.owned.has(id))
      throw new ControlPlaneError("SESSION_UNAVAILABLE");
    const execution = context.owned.get(id);
    await stopSession(context, id, (ownedExecution) =>
      context.inputState.markStopping(id, ownedExecution),
    );
    if (execution) context.inputState.confirmExecution(id, execution);
    return DurableSessionManagerRead.get(context.store, id);
  });
}
