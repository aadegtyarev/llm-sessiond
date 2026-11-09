import assert from 'node:assert/strict';
import test from 'node:test';
import type { CoreEvent } from '../src/types.ts';
import { createEventPublisher } from '../src/events.ts';

function eventOf(type: CoreEvent['type']): CoreEvent {
  if (type === 'session') return { type, session: { sessionId: 's', status: 'created' } };
  if (type === 'tool') return { type, sessionId: 's', phase: 'start', toolCallId: 't', toolName: 'fixture', args: {} };
  if (type === 'question') return { type, sessionId: 's', question: { requestId: 'q', method: 'input', title: 'title' } };
  if (type === 'notification') return { type, sessionId: 's', method: 'notify', message: 'hello', level: 'info' };
  if (type === 'native-record') return { type, sessionId: 's', record: { extra: ['hello'] } };
  return { type, sessionId: 's', text: 'hello' };
}

for (const type of ['session', 'text', 'tool', 'question', 'notification', 'native-record'] as const) {
  for (const asynchronous of [false, true]) {
    test(`events: ${type} fixes recipients across subscription mutation (${asynchronous ? 'async' : 'sync'})`, () => {
      const publisher = createEventPublisher();
      const seen: string[] = [];
      let changed = false;
      let unsubscribeSelf = () => {};
      let unsubscribeRemoved = () => {};
      const newcomer = () => { seen.push('new'); };
      const self = () => {
        seen.push('self');
        if (!changed) {
          changed = true;
          unsubscribeSelf();
          unsubscribeSelf = publisher.subscribe(self);
          unsubscribeRemoved();
          publisher.subscribe(newcomer);
          publisher.subscribe(newcomer);
        }
        return asynchronous ? Promise.resolve() : undefined;
      };
      unsubscribeSelf = publisher.subscribe(self);
      unsubscribeRemoved = publisher.subscribe(() => { seen.push('removed'); });
      publisher.subscribe(() => { seen.push('steady'); });
      publisher.publish(eventOf(type));
      assert.deepEqual(seen, ['self', 'removed', 'steady']);
      seen.length = 0;
      publisher.publish(eventOf(type));
      assert.deepEqual(seen, ['steady', 'self', 'new']);
    });
  }

  test(`events: ${type} new recipient chains cannot extend a delivery`, () => {
    const publisher = createEventPublisher();
    const seen: number[] = [];
    const listener = (id: number) => () => {
      seen.push(id);
      if (id < 4) publisher.subscribe(listener(id + 1));
    };
    publisher.subscribe(listener(0));
    publisher.publish(eventOf(type));
    assert.deepEqual(seen, [0]);
    publisher.publish(eventOf(type));
    assert.deepEqual(seen, [0, 0, 1]);
  });
}
