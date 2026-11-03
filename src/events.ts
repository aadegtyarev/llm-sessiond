import type { CoreEvent, InputView, SessionStatus, SessionView } from './contracts.ts';

export function inputView(input: InputView): InputView {
  return Object.freeze({ inputId: input.inputId, status: input.status });
}

export function sessionView(session: { id: string; status: SessionStatus; input: InputView | null }): SessionView {
  return Object.freeze({
    sessionId: session.id,
    status: session.status,
    input: session.input ? inputView(session.input) : null,
  });
}

export function createEventPublisher() {
  const subscribers = new Set<(event: CoreEvent) => unknown>();
  return {
    subscribe(listener: (event: CoreEvent) => unknown): () => void {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    publish(event: CoreEvent): void {
      const publicEvent = Object.freeze(event);
      for (const subscriber of subscribers) {
        try {
          const result = subscriber(publicEvent);
          if (result && typeof (result as PromiseLike<unknown>).then === 'function') void Promise.resolve(result).catch(() => {});
        } catch {
          // A subscriber cannot interrupt another observer or core operation.
        }
      }
    },
  };
}
