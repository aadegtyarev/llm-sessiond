import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apiFixture } from './api-support.ts';
import { FakePort, deferred } from './fake-port.ts';
import type { PortOutcome } from '../src/types.ts';

test('daemon SSE ready precedes startup; all six events preserve FIFO/IDs and isolation', async t => {
  const port = new FakePort();
  const api = await apiFixture(t, port);
  const stream = await api.stream();
  t.after(() => stream.close());
  assert.deepEqual(stream.events, [{ event: 'ready', data: {} }]);
  await api.running('a'); await api.running('b');
  const startup = await stream.next(f => f.event === 'core' && f.data.type === 'session' && f.data.session.status === 'starting');
  assert.equal(startup.event, 'core');
  assert.equal((await api.request('/sessions/a/send', { inputId: 'i', text: 'hello' })).status, 'pending');
  port.emit('a', { type: 'text', text: 'display-sensitive-explicit' });
  port.emit('a', { type: 'tool', phase: 'start', toolCallId: 'native-tool', toolName: 'fixture', args: {} });
  port.emit('a', { type: 'question', question: { requestId: 'native-q', method: 'input', title: 'answer' } });
  port.emit('a', { type: 'notification', method: 'notify', level: 'info', message: 'waiting' });
  port.emit('a', { type: 'input-completed', inputId: 'wrong' });
  assert.equal((await api.request('/sessions/a')).input.status, 'pending');
  assert.equal((await api.request('/sessions/b')).input, null);
  port.emit('a', { type: 'input-completed', inputId: 'i' });
  await stream.next(f => f.event === 'core' && f.data.type === 'input' && f.data.input.status === 'completed');
  const observed = stream.events.filter(f => f.event === 'core').map(f => f.data);
  assert.deepEqual(observed.slice(-5).map(e => e.type), ['text', 'tool', 'question', 'notification', 'input']);
  for (const event of observed.slice(-5, -1)) {
    assert.equal('sessionId' in event && event.sessionId, 'a');
    assert.equal('inputId' in event, false);
  }
  await api.request('/sessions/a/send', { inputId: 'i', text: 'duplicate' }, 409);
  assert.equal(port.sends.length, 1);
  await api.request('/sessions', { sessionId: 'a' }, 409);
  await api.request('/sessions/missing', undefined, 409);
  assert.equal((await api.request('/sessions/a/stop', {})).status, 'stopped');
  assert.deepEqual(await api.request('/shutdown', {}), { stoppedSessionIds: ['b'], uncertainSessionIds: [], failedSessionIds: [] });
  await api.daemon.closed;
});

test('daemon disconnect does not cancel/replay send or stop session; uncertainty blocks next input', async t => {
  const port = new FakePort();
  const gate = deferred<PortOutcome>();
  const entered = deferred<void>();
  port.sendOperation = () => { entered.resolve(); return gate.promise; };
  const api = await apiFixture(t, port);
  const stream = await api.stream();
  await api.running();
  const abort = new AbortController();
  const response = fetch(api.base + '/sessions/s/send', { method: 'POST',
    headers: { ...api.headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputId: 'one', text: 'once' }), signal: abort.signal,
  }).catch(() => undefined);
  await entered.promise;
  abort.abort(); await response; await stream.close();
  assert.equal((await api.request('/sessions/s')).input.status, 'pending');
  assert.equal(port.stops.length, 0);
  gate.resolve({ kind: 'unknown' });
  const current = await api.request('/sessions/s');
  assert.equal(current.input.status, 'unknown');
  await api.request('/sessions/s/send', { inputId: 'two', text: 'blocked' }, 409);
  assert.equal(port.sends.length, 1);
  const replacement = await api.stream();
  assert.deepEqual(replacement.events, [{ event: 'ready', data: {} }]);
  await replacement.close();
  assert.equal((await api.request('/sessions/s/stop', {})).status, 'stopped');
});
