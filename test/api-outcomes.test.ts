import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apiFixture } from './api-support.ts';
import { FakePort, deferred } from './fake-port.ts';
import type { HarnessEvent, PortOutcome, ReplyOutcome } from '../src/types.ts';

test('daemon validates replies before Core and preserves written/rejected/unknown', async t => {
  const port = new FakePort();
  let outcome: ReplyOutcome = { kind: 'written' };
  const replies: unknown[] = [];
  const api = await apiFixture(t, { ...{
    start: port.start.bind(port), send: port.send.bind(port), stop: port.stop.bind(port),
    async reply(id: string, answer: unknown) { replies.push({ id, answer }); return outcome; },
  } });
  await api.running();
  for (const body of [{}, { requestId: '', method: 'input', value: '' },
    { requestId: 'q', method: 'confirm', value: true }, { requestId: 'q', method: 'input', value: 'x', cancelled: true },
    { requestId: 'q', method: 'input', value: 1 }, { requestId: 'q', method: 'other', cancelled: true }]) {
    await api.request('/sessions/s/reply', body, 400);
  }
  assert.equal(replies.length, 0);
  for (const kind of ['written', 'rejected', 'unknown'] as const) {
    outcome = { kind };
    assert.deepEqual(await api.request('/sessions/s/reply', { requestId: 'q', method: 'confirm', confirmed: true }), { kind });
    assert.equal((await api.request('/sessions/s')).input, null);
  }
  assert.equal(replies.length, 3);
});

test('daemon shutdown closes admission immediately and reports uncertain/failed cleanup honestly', async t => {
  const gate = deferred<PortOutcome>();
  const entered = deferred<void>();
  const stops: string[] = [];
  const port = new FakePort();
  const api = await apiFixture(t, {
    start: port.start.bind(port), send: port.send.bind(port),
    async stop(id) {
      stops.push(id);
      if (id === 'a') { entered.resolve(); return gate.promise; }
      return { kind: 'rejected' };
    },
  });
  await api.running('a'); await api.running('b');
  const shutdown = api.request('/shutdown', {});
  await entered.promise;
  await api.request('/sessions', undefined, 503);
  await api.request('/sessions', { sessionId: 'late' }, 503);
  gate.resolve({ kind: 'unknown' });
  assert.deepEqual(await shutdown, { stoppedSessionIds: [], uncertainSessionIds: ['a'], failedSessionIds: ['b'] });
  assert.deepEqual(stops, ['a', 'b']);
});

test('daemon permits immediate HTTP reply to startup question before start ACK', async t => {
  const ready = deferred<PortOutcome>();
  let emitted: ((event: HarnessEvent) => void) | undefined;
  const api = await apiFixture(t, {
    async start(_id, emit) {
      emitted = emit;
      emit({ type: 'question', question: { requestId: 'startup-q', method: 'input', title: 'startup' } });
      return ready.promise;
    },
    async reply() { ready.resolve({ kind: 'confirmed' }); return { kind: 'written' }; },
    async send() { return { kind: 'confirmed' }; }, async stop() { return { kind: 'confirmed' }; },
  });
  const stream = await api.stream();
  await api.request('/sessions', { sessionId: 's' });
  const start = api.request('/sessions/s/start', {});
  await stream.next(f => f.event === 'core' && f.data.type === 'question');
  assert.ok(emitted);
  assert.deepEqual(await api.request('/sessions/s/reply', { requestId: 'startup-q', method: 'input', value: 'explicit' }), { kind: 'written' });
  assert.equal((await start).status, 'running');
  await stream.close();
});
