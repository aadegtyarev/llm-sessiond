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
      locks.run(id, async () => {
        const execution =
          context.owned.get(id) ?? context.pending.get(id)?.execution;
        if (execution) {
          context.inputState.markStopping(id, execution);
          context.executionEvents.markStopping(id, execution);
        }
        await shutdownOwnedExecution(context, id, (_id, stoppedExecution) => {
          context.inputState.confirmExecution(id, stoppedExecution);
          context.executionEvents.close(id);
        });
      }),
    ),
  );
}
