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
  const subscribers = new Set<(event: CoreEvent) => void>();
  return {
    subscribe(listener: (event: CoreEvent) => void): () => void {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    publish(event: CoreEvent): void {
      const publicEvent = Object.freeze(event);
      for (const subscriber of subscribers) {
        try {
          subscriber(publicEvent);
        } catch {
          // A subscriber cannot interrupt another observer or core operation.
        }
      }
    },
  };
}
