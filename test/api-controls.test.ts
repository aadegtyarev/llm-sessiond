import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apiFixture } from './api-support.ts';
import { FakePort } from './fake-port.ts';
import type { HarnessPort, SessionSettings } from '../src/types.ts';

const settings: SessionSettings = { model: { provider: 'fixture', id: 'one' },
  thinkingLevel: 'off', availableThinkingLevels: ['off'] };
function port() {
  const fake = new FakePort();
  const calls: string[] = [];
  const harness: HarnessPort = {
    start: (id, emit) => fake.start(id, emit), send: (...args) => fake.send(...args), stop: (...args) => fake.stop(...args),
    async models() { calls.push('models'); return { kind: 'confirmed', value: [settings.model!] }; },
    async settings() { calls.push('settings'); return { kind: 'confirmed', value: settings }; },
    async setModel(_id, choice) { calls.push(`model:${choice.provider}/${choice.modelId}`); return { kind: 'confirmed', value: settings }; },
    async setThinkingLevel(_id, level) { calls.push(`effort:${level}`); return { kind: 'confirmed', value: settings }; },
    async reload() { calls.push('reload'); return { kind: 'confirmed', value: settings }; },
  };
  return { harness, calls };
}

test('api-controls: named authenticated routes and actual readback DTO', async t => {
  const p = port(); const api = await apiFixture(t, p.harness); await api.running();
  assert.deepEqual(await api.request('/sessions/s/models'), { kind: 'confirmed', value: [settings.model] });
  assert.deepEqual(await api.request('/sessions/s/settings'), { kind: 'confirmed', value: settings });
  for (const [name, body] of [['model', { provider: 'fixture', modelId: 'two' }], ['thinking-level', { level: 'high' }], ['reload', {}]] as const) {
    assert.deepEqual(await api.request(`/sessions/s/${name}`, body), { kind: 'confirmed', value: settings });
  }
  assert.deepEqual(p.calls, ['models', 'settings', 'model:fixture/two', 'effort:high', 'reload']);
});

for (const [name, body] of [['models', undefined], ['settings', undefined], ['model', { provider: 'fixture', modelId: 'one' }],
  ['thinking-level', { level: 'off' }], ['reload', {}]] as const) {
  test(`api-controls: ${name} auth precedes effects and wrong method rejects`, async t => {
    const p = port(); const api = await apiFixture(t, p.harness); await api.running();
    await api.request(`/sessions/s/${name}`, body, 401, { headers: {} });
    await api.request(`/sessions/s/${name}`, body === undefined ? {} : undefined, 405);
    assert.deepEqual(p.calls, []);
  });
}
for (const [name, body] of [
  ['model', {}], ['model', { provider: 'fixture' }], ['model', { provider: '', modelId: 'one' }],
  ['model', { provider: 'fixture', modelId: '' }], ['model', { provider: 1, modelId: 'one' }],
  ['model', { provider: 'fixture', modelId: 'one', persist: true }], ['model', { provider: 'fixture', modelId: 'one', headers: {} }],
  ['thinking-level', {}], ['thinking-level', { level: '' }], ['thinking-level', { level: 1 }],
  ['thinking-level', { level: 'high', persist: true }], ['reload', { command: 'anything' }],
]) {
  test(`api-controls: strict ${name} body ${JSON.stringify(body)}`, async t => {
    const p = port(); const api = await apiFixture(t, p.harness); await api.running();
    await api.request(`/sessions/s/${name}`, body, 400);
    assert.deepEqual(p.calls, []);
  });
}

test('api-controls: pending input rejects mutators without suppressing read-only queries', async t => {
  const p = port(); const api = await apiFixture(t, p.harness); await api.running();
  await api.request('/sessions/s/send', { inputId: 'i', text: 'ordinary' });
  await api.request('/sessions/s/reload', {}, 409);
  await api.request('/sessions/s/model', { provider: 'fixture', modelId: 'one' }, 409);
  await api.request('/sessions/s/thinking-level', { level: 'off' }, 409);
  assert.equal((await api.request('/sessions/s/settings')).kind, 'confirmed');
  assert.deepEqual(p.calls, ['settings']);
});
