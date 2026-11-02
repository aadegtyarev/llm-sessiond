import type { DurableManagerContext } from "./durable-manager-context.js";
import type { PerSessionLock } from "./per-session-lock.js";
import type { DurableSession } from "../persistence/session-record.js";
import { assertCurrentOwner } from "./session-lifecycle-support.js";
import { stopManagedSession } from "./durable-manager-stop.js";
import { shutdownOwnedSessions } from "./shutdown-owned-sessions.js";
import {
  beginLifecycleIntent,
  endLifecycleIntent,
} from "./durable-lifecycle-intents.js";

export function stopOwnedSession(
  context: DurableManagerContext,
  locks: PerSessionLock,
  id: string,
): Promise<DurableSession> {
  const intent = beginLifecycleIntent(context, [id]);
  return stopManagedSession(context, locks, id).finally(() =>
    endLifecycleIntent(context, intent),
  );
}
export function shutdownOwnedSessionsWithIntent(
  context: DurableManagerContext,
  locks: PerSessionLock,
): Promise<void> {
  const ids = [
    ...new Set([...context.owned.keys(), ...context.pending.keys()]),
  ];
  const intent = beginLifecycleIntent(context, ids);
  try {
    assertCurrentOwner(context);
  } catch (error) {
    endLifecycleIntent(context, intent);
    throw error;
  }
  return shutdownOwnedSessions(context, locks).finally(() =>
    endLifecycleIntent(context, intent),
  );
}
