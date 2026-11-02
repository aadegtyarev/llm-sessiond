import type { DurableManagerContext } from "./durable-manager-context.js";

export interface LifecycleIntent {
  token: object;
  sessionIds: string[];
}
export function beginLifecycleIntent(
  context: DurableManagerContext,
  sessionIds: string[],
): LifecycleIntent {
  const intent = { token: {}, sessionIds: [...new Set(sessionIds)] };
  for (const id of intent.sessionIds) {
    const active = context.lifecycleIntents.get(id) ?? new Set<object>();
    active.add(intent.token);
    context.lifecycleIntents.set(id, active);
  }
  return intent;
}
export function endLifecycleIntent(
  context: DurableManagerContext,
  intent: LifecycleIntent,
): void {
  for (const id of intent.sessionIds) {
    const active = context.lifecycleIntents.get(id);
    active?.delete(intent.token);
    if (active?.size === 0) context.lifecycleIntents.delete(id);
  }
}
export function hasLifecycleIntent(
  context: DurableManagerContext,
  id: string,
): boolean {
  return (context.lifecycleIntents.get(id)?.size ?? 0) > 0;
}
