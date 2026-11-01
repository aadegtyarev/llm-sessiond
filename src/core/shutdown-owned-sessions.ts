import type { DurableManagerContext } from "./durable-manager-context.js";
import type { PerSessionLock } from "./per-session-lock.js";
import { shutdownOwnedExecution } from "./session-shutdown.js";
export async function shutdownOwnedSessions(
  context: DurableManagerContext,
  locks: PerSessionLock,
): Promise<void> {
  const ids = new Set([...context.owned.keys(), ...context.pending.keys()]);
  await Promise.all(
    [...ids].map((id) =>
      locks.run(id, () => shutdownOwnedExecution(context, id)),
    ),
  );
}
