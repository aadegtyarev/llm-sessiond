import type { CoreEvent, HarnessEvent, SessionRecord, SessionStatus, SessionView } from './types.ts';

export function sessionView(session: { id: string; status: SessionStatus }): SessionView {
  return Object.freeze({
    sessionId: session.id,
    status: session.status,
  });
}

/** Detach consumer payloads before publication; freeze nested display data too. */
export function snapshot<T>(value: T): T {
  const copy = structuredClone(value);
  const seen = new WeakSet<object>();
  function freeze(item: unknown): void {
    if (item === null || typeof item !== 'object' || seen.has(item)) return;
    seen.add(item);
    for (const child of Object.values(item)) freeze(child);
    Object.freeze(item);
  }
  freeze(copy);
  return copy;
}

export function acceptHarnessEvent(
  session: SessionRecord,
  generation: number,
  event: HarnessEvent,
  notify: (event: CoreEvent) => void,
): void {
  if (session.generation !== generation || session.stopRequested
    || (session.status !== 'starting' && session.status !== 'running')) return;
  notify(snapshot({ ...event, sessionId: session.id }));
}

export function createEventPublisher() {
  const subscribers = new Set<(event: CoreEvent) => unknown>();
  const pending: { event: CoreEvent; recipients: ((event: CoreEvent) => unknown)[] }[] = [];
  let delivering = false;
  return {
    subscribe(listener: (event: CoreEvent) => unknown): () => void {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    publish(event: CoreEvent): void {
      pending.push({ event: Object.freeze(event), recipients: [...subscribers] });
      if (delivering) return;
      delivering = true;
      try {
        // Reentrant publications keep their publish-time recipients and wait their turn.
        while (pending.length > 0) {
          const delivery = pending.shift()!;
          for (const subscriber of delivery.recipients) {
            try {
              const result = subscriber(delivery.event);
              if (result && typeof (result as PromiseLike<unknown>).then === 'function') void Promise.resolve(result).catch(() => {});
            } catch {
              // Synchronous subscriber errors are isolated; callbacks are not sandboxed.
            }
          }
        }
      } finally {
        delivering = false;
      }
    },
  };
}
