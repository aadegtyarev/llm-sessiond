import type { DurableManagerContext } from "./durable-manager-context.js";
import type { PerSessionLock } from "./per-session-lock.js";
import { shutdownOwnedExecution } from "./session-shutdown.js";
export async function shutdownOwnedSessions(
  context: DurableManagerContext,
  locks: PerSessionLock,
  onConfirmed?: (
    id: string,
    execution: import("./lifecycle-execution.js").LifecycleExecution,
  ) => void,
): Promise<void> {
  const ids = new Set([...context.owned.keys(), ...context.pending.keys()]);
  await Promise.all(
    [...ids].map(async (id) => {
      const execution =
        context.owned.get(id) ?? context.pending.get(id)?.execution;
      const confirmed = await locks.run(id, () =>
        shutdownOwnedExecution(context, id),
      );
      if (confirmed && execution) onConfirmed?.(id, execution);
    }),
  );
}
