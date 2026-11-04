import assert from 'node:assert/strict';
import test from 'node:test';
import type { CoreEvent } from '../src/types.ts';
import { createEventPublisher } from '../src/events.ts';

function eventOf(type: CoreEvent['type']): CoreEvent {
  if (type === 'session') return { type, session: { sessionId: 's', status: 'created', input: null } };
  if (type === 'input') return { type, sessionId: 's', input: { inputId: 'i', status: 'pending' } };
  return { type, sessionId: 's', text: 'hello' };
}

for (const type of ['session', 'input', 'text'] as const) {
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
