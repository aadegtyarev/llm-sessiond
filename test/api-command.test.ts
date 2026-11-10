import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CoreError, type NativeResponse } from '../src/types.ts';
import { listenDaemon } from '../src/daemon.ts';
import { apiFixture } from './api-support.ts';
import { apiClient } from './api-client.mjs';
import { FakePort, deferred } from './fake-port.ts';

for (const body of [{}, { customInstructions: '' }, { customInstructions: 'preserve details' }]) {
  test(`api compact: same command path ${JSON.stringify(body)}`, async t => {
    const port = new FakePort(); const api = await apiFixture(t, port); await api.running();
    const result: NativeResponse = { id: 'r', type: 'response', command: 'compact', success: true,
      data: { summary: 'whole', firstKeptEntryId: 'entry', tokensBefore: 150000,
        estimatedTokensAfter: 123, usage: [1], details: { opaque: true } }, future: ['metadata'] };
    port.commandOperation = async () => result;
    assert.deepEqual(await api.request('/sessions/s/compact', body), result);
    assert.deepEqual(await api.request('/sessions/s/command', { type: 'compact', ...body }), result);
    assert.deepEqual(port.commands.map(call => call.command), [{ type: 'compact', ...body }, { type: 'compact', ...body }]);
  });
}

for (const path of ['command', 'compact']) {
  test(`api ${path}: auth/schema before effects; Native errors remain whole HTTP200`, async t => {
    const port = new FakePort(); const api = await apiFixture(t, port); await api.running();
    const valid = path === 'compact' ? {} : { type: 'prompt' };
    await api.request(`/sessions/s/${path}`, valid, 401, { headers: {} });
    const invalid = path === 'compact' ? [{ customInstructions: null }, { customInstructions: 4 }, { customInstructions: [] },
      { type: 'compact' }, { extra: true }, { customInstructions: 'x', extra: 1 }] : [{}, { type: '' }, { type: 1 }, { command: { type: 'prompt' } }];
    for (const body of invalid) await api.request(`/sessions/s/${path}`, body, 400);
    assert.equal(port.commands.length, 0);
    const response: NativeResponse = { type: 'response', id: 'error', command: path === 'compact' ? 'compact' : 'prompt',
      success: false, error: 'native refusal', optional: { busy: true } };
    port.commandOperation = async () => response;
    assert.deepEqual(await api.request(`/sessions/s/${path}`, valid), response);
    assert.equal(port.commands.length, 1);
  });
}

for (const operation of ['command', 'compact'] as const) {
  test(`api ${operation}: shape parity, validation precedes Core lookup and port effects`, async t => {
    const port = new FakePort(); const api = await apiFixture(t, port); await api.running();
    const invalid = operation === 'command'
      ? [{}, ...['', null, 0, false, [], {}].map(type => ({ type }))]
      : [...[null, 0, false, [], {}].map(customInstructions => ({ customInstructions })),
        { type: 'compact' }, { extra: true }, { customInstructions: '', extra: true }];
    for (const body of invalid) {
      for (const id of ['s', 'missing']) {
        assert.deepEqual(await api.request(`/sessions/${id}/${operation}`, body, 400), { error: { code: 'schema' } });
      }
    }
    assert.equal(port.commands.length, 0);
    const valid = operation === 'command'
      ? [{ type: ' \t\n' }, { type: 'future_native', arbitrary: { nested: [1, null, '🙂'] } },
        { type: 'control_response', response: { request_id: 'q', response: { behavior: 'deny' } }, extra: true }]
      : [{}, { customInstructions: '' }, { customInstructions: 'preserve 🙂' }];
    for (const body of valid) {
      await api.request(`/sessions/s/${operation}`, body);
      assert.deepEqual(port.commands.at(-1), { sessionId: 's', command: operation === 'compact' ? { ...body, type: 'compact' } : body });
    }
    assert.equal(port.commands.length, valid.length);
  });
}

test('api command: no allowlist, file/domain guards, defaults or automatic proof requests', async t => {
  const port = new FakePort(); const api = await apiFixture(t, port); await api.running();
  for (const command of [{ type: 'prompt', message: 'no streaming default' },
    { type: 'switch_session', sessionPath: '/Pi/chooses/history.jsonl' }, { type: 'new_session' },
    { type: 'set_model', provider: 'any', modelId: 'native-owned', persist: true },
    { type: 'abort' }, { type: 'future_native_command', metadata: [1] }]) {
    assert.equal((await api.request('/sessions/s/command', command)).success, true);
    assert.deepEqual(port.commands.at(-1), { sessionId: 's', command });
  }
  assert.equal(port.commands.length, 6);
  for (const route of ['send', 'cancel', 'model', 'settings', 'reload', 'register', 'delete']) {
    await api.request(`/sessions/s/${route}`, {}, 404);
  }
});

test('api command: delayed concurrent requests resolve independently, events are not responses', async t => {
  const port = new FakePort(); const api = await apiFixture(t, port); await api.running();
  const started = deferred<void>(), first = deferred<NativeResponse | null>();
  port.commandOperation = async command => {
    if (command.type === 'compact') { started.resolve(); return first.promise; }
    return { type: 'response', id: 'second', command: command.type, success: true, data: { disposition: 'queued' } };
  };
  let done = false;
  const compact = api.request('/sessions/s/compact', {}); void compact.then(() => { done = true; });
  await started.promise;
  port.emit('s', { type: 'text', text: 'intermediate' });
  assert.equal((await api.request('/sessions/s/command', { type: 'abort' })).id, 'second');
  assert.equal(done, false);
  first.resolve({ type: 'response', id: 'first', command: 'compact', success: true, data: { summary: 'done' } });
  assert.equal((await compact).id, 'first');
});

for (const mode of ['unsupported', 'loss', 'exception'] as const) {
  test(`api compact: ${mode} maps only absent response to safe 409`, async t => {
    const port = new FakePort();
    port.commandOperation = async () => {
      if (mode === 'unsupported') throw new CoreError('harness-rejected');
      if (mode === 'exception') throw new Error('private config/diagnostics');
      return null;
    };
    const token = 'a'.repeat(43);
    const daemon = await listenDaemon({ token, port: 0, harness: port });
    t.after(async () => { await daemon.close(); await daemon.closed; });
    const api = apiClient(daemon.port, token);
    await api.request('/sessions', { sessionId: 's' }); await api.request('/sessions/s/start', {});
    assert.deepEqual(await api.request('/sessions/s/compact', {}, 409), {
      error: { code: mode === 'unsupported' ? 'harness-rejected' : 'harness-unknown' } });
  });
}

for (const disposition of ['started', 'queued', 'handled', 'future-native-value']) {
  test(`api command: full prompt ${disposition} and unmodified client parameters`, async t => {
    const port = new FakePort(); const api = await apiFixture(t, port); await api.running();
    const command = { type: 'prompt', message: 'busy', streamingBehavior: 'followUp', images: [{ data: 'opaque' }] };
    const response: NativeResponse = { type: 'response', id: 'native-id', command: 'prompt', success: true,
      data: { disposition, optional: { usage: [1] } }, metadata: { future: true } };
    port.commandOperation = async () => response;
    assert.deepEqual(await api.request('/sessions/s/command', command), response);
    assert.deepEqual(port.commands, [{ sessionId: 's', command }]);
  });
}
