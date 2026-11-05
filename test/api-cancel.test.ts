import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apiFixture } from './api-support.ts';
import { FakePort } from './fake-port.ts';
import type { PortOutcome } from '../src/types.ts';

test('HTTP cancel: auth and strict inputId schema precede target effects', async t => {
  const raw = new FakePort();
  const calls: string[][] = [];
  const port = Object.assign(raw, { cancel: async (...args: [string, string]): Promise<PortOutcome> => {
    calls.push(args); raw.emit(args[0], { type: 'input-cancelled', inputId: args[1] });
    return { kind: 'confirmed' };
  } });
  const api = await apiFixture(t, port);
  await api.running();
  await api.request('/sessions/s/send', { inputId: 'A', text: '' });
  const response = await fetch(api.base + '/sessions/s/cancel', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inputId: 'A' }) });
  assert.equal(response.status, 401);
  for (const body of [{}, { inputId: 'A', text: '' }, { inputId: null }, { inputId: '' },
    { inputId: '../x' }, { inputId: 'x'.repeat(129) }]) await api.request('/sessions/s/cancel', body, 400);
  await api.request('/sessions/s/cancel', undefined, 405);
  await api.request('/sessions/other/cancel', { inputId: 'A' }, 409);
  await api.request('/sessions/s/cancel', { inputId: 'wrong' }, 409);
  assert.deepEqual(calls, []);
  const stream = await api.stream();
  t.after(() => stream.close());
  assert.deepEqual(await api.request('/sessions/s/cancel', { inputId: 'A' }), { inputId: 'A', status: 'cancelled' });
  const terminal = await stream.next(f => f.event === 'core' && f.data.type === 'input');
  assert.deepEqual(terminal.data, { type: 'input', sessionId: 's', input: { inputId: 'A', status: 'cancelled' } });
  await api.request('/sessions/s/send', { inputId: 'B', text: '' });
  await api.request('/sessions/s/cancel', { inputId: 'A' }, 409);
  assert.deepEqual(calls, [['s', 'A']]);
  assert.equal((await api.request('/sessions/s')).input.inputId, 'B');
});

test('HTTP cancel: unsupported is rejected and does not fabricate terminal', async t => {
  const api = await apiFixture(t);
  await api.running();
  await api.request('/sessions/s/send', { inputId: 'A', text: '' });
  assert.deepEqual(await api.request('/sessions/s/cancel', { inputId: 'A' }, 409),
    { error: { code: 'harness-rejected' } });
  assert.equal((await api.request('/sessions/s')).input.status, 'pending');
  await api.request('/sessions/s/send', { inputId: 'B', text: '' }, 409);
});
