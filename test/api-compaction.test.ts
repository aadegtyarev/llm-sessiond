import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apiFixture } from './api-support.ts';
import { FakePort } from './fake-port.ts';
import type { HarnessPort, HarnessControlResult } from '../src/types.ts';

function port(result: HarnessControlResult<void> = { kind: 'confirmed', value: undefined }) {
  const fake = new FakePort();
  const calls: (string | undefined)[] = [];
  const harness: HarnessPort = {
    start: (id, emit) => fake.start(id, emit), send: (...args) => fake.send(...args), stop: (...args) => fake.stop(...args),
    async compact(_id, instructions) { calls.push(instructions); return result; },
  };
  return { harness, calls };
}

for (const body of [{}, { instructions: '' }, { instructions: '  keep exact facts\n' }]) {
  test(`api-compaction: strict optional instructions ${JSON.stringify(body)}, kind-only private-free response`, async t => {
    const p = port({ kind: 'confirmed', value: { summary: 'private', usage: 'private' } } as unknown as HarnessControlResult<void>);
    const api = await apiFixture(t, p.harness); await api.running();
    assert.deepEqual(await api.request('/sessions/s/compact', body), { kind: 'confirmed' });
    assert.deepEqual(p.calls, ['instructions' in body ? body.instructions : undefined]);
    assert.equal((await api.request('/sessions/s/send', { inputId: 'next', text: 'continue' })).status, 'pending');
  });
}
for (const body of [null, [], '', { instructions: null }, { instructions: false }, { instructions: 1 },
  { instructions: [] }, { customInstructions: 'native-field-forbidden' }, { instructions: 'x', extra: true }, { abort: true }]) {
  test(`api-compaction: malformed ${JSON.stringify(body)} never reaches port`, async t => {
    const p = port(); const api = await apiFixture(t, p.harness); await api.running();
    await api.request('/sessions/s/compact', body, 400); assert.deepEqual(p.calls, []);
  });
}

test('api-compaction: auth/method/content-type/body limits before operation', async t => {
  const p = port(); const api = await apiFixture(t, p.harness); await api.running();
  await api.request('/sessions/s/compact', {}, 401, { headers: {} });
  await api.request('/sessions/s/compact', undefined, 405);
  await api.request('/sessions/s/compact', {}, 415, { headers: { Authorization: `Bearer ${api.token}`, 'Content-Type': 'text/plain' } });
  await api.request('/sessions/s/compact', { instructions: 'x'.repeat(65_536) }, 413);
  assert.deepEqual(p.calls, []);
});
for (const outcome of ['rejected', 'unknown', 'uncertain'] as const) {
  test(`api-compaction: ${outcome} HTTP200 is not success confirmation`, async t => {
    const p = port(outcome === 'uncertain' ? { kind: 'unknown', effectUncertain: true } : { kind: outcome });
    const api = await apiFixture(t, p.harness); await api.running();
    assert.deepEqual(await api.request('/sessions/s/compact', {}), { kind: outcome === 'uncertain' ? 'unknown' : outcome });
    if (outcome === 'uncertain') {
      assert.equal((await api.request('/sessions/s')).status, 'unknown');
      await api.request('/sessions/s/send', { inputId: 'blocked', text: '' }, 409);
    } else assert.equal((await api.request('/sessions/s/send', { inputId: 'next', text: '' })).status, 'pending');
  });
}

test('api-compaction: pending input is not implicitly cancelled', async t => {
  const p = port(); const api = await apiFixture(t, p.harness); await api.running();
  await api.request('/sessions/s/send', { inputId: 'active', text: '' });
  await api.request('/sessions/s/compact', {}, 409);
  assert.deepEqual(p.calls, []);
  assert.equal((await api.request('/sessions/s')).input.status, 'pending');
});
