import assert from 'node:assert/strict';
import test from 'node:test';
import type { CoreEvent } from '../src/types.ts';
import { createEventPublisher } from '../src/events.ts';

function eventOf(type: CoreEvent['type'], id: string): CoreEvent {
  if (type === 'session') return { type, session: { sessionId: id, status: 'created' } };
  if (type === 'tool') return { type, sessionId: id, phase: 'start', toolCallId: id, toolName: 'fixture', args: {} };
  if (type === 'question') return { type, sessionId: id, question: { requestId: id, method: 'input', title: id } };
  if (type === 'notification') return { type, sessionId: id, method: 'notify', message: id, level: 'info' };
  return { type, sessionId: id, text: id };
}

function idOf(event: CoreEvent): string {
  return event.type === 'session' ? event.session.sessionId : event.sessionId;
}

for (const outerType of ['session', 'text', 'tool', 'question', 'notification'] as const) {
  for (const nestedType of ['session', 'text', 'tool', 'question', 'notification'] as const) {
    test(`events: FIFO ${outerType} → ${nestedType}, with publish-time recipients`, () => {
      const publisher = createEventPublisher();
      const seen: string[] = [];
      publisher.subscribe((event) => {
        const id = idOf(event);
        seen.push(`A:${id}`);
        if (id === 'outer') {
          publisher.publish(eventOf(nestedType, 'first'));
          removeB();
          publisher.subscribe((next) => { seen.push(`C:${idOf(next)}`); });
          publisher.publish(eventOf('text', 'second'));
        }
        if (id === 'first') publisher.publish(eventOf('notification', 'third'));
      });
      const removeB = publisher.subscribe((event) => { seen.push(`B:${idOf(event)}`); });
      publisher.publish(eventOf(outerType, 'outer'));
      assert.deepEqual(seen, [
        'A:outer', 'B:outer', 'A:first', 'B:first',
        'A:second', 'C:second', 'A:third', 'C:third',
      ]);
      seen.length = 0;
      publisher.publish(eventOf(outerType, 'later'));
      assert.deepEqual(seen, ['A:later', 'C:later']);
    });
  }

  test(`events: ${outerType} isolates errors during reentry without waiting for async observers`, async () => {
    const publisher = createEventPublisher();
    const seen: string[] = [];
    const never = new Promise<void>(() => {});
    publisher.subscribe((event) => {
      if (idOf(event) === 'outer') publisher.publish(eventOf(outerType, 'nested'));
      throw new Error('isolated sync error');
    });
    publisher.subscribe(async () => { throw new Error('isolated rejection'); });
    publisher.subscribe(() => never);
    publisher.subscribe((event) => { seen.push(idOf(event)); });
    publisher.publish(eventOf(outerType, 'outer'));
    assert.deepEqual(seen, ['outer', 'nested']);
    await new Promise<void>((resolve) => setImmediate(resolve));
    publisher.publish(eventOf(outerType, 'later'));
    assert.deepEqual(seen, ['outer', 'nested', 'later']);
  });
}
