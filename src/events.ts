import type { CoreEvent, HarnessEvent, InputView, SessionRecord, SessionStatus, SessionView } from './contracts.ts';

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

export function acceptHarnessEvent(
  session: SessionRecord,
  generation: number,
  event: HarnessEvent,
  notify: (event: CoreEvent) => void,
): void {
  if (session.generation !== generation || session.status !== 'running') return;
  if (event.type === 'text') {
    notify({ type: 'text', sessionId: session.id, text: event.text });
    return;
  }
  if (!session.input || session.input.inputId !== event.inputId || (session.input.status !== 'pending' && session.input.status !== 'unknown')) return;
  session.input.status = event.type === 'input-completed' ? 'completed' : event.certainty === 'definitive' ? 'failed' : 'unknown';
  notify({ type: 'input', sessionId: session.id, input: inputView(session.input) });
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
