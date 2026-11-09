import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listenDaemon } from '../src/daemon.ts';
import { createHarnessRegistry, type HarnessPort } from '../src/core.ts';
import { apiClient } from './api-client.mjs';
import { FakePort } from './fake-port.ts';

const token = 'integration_' + 'b'.repeat(32);

test('daemon-routes: selector schema and unknown modules reject before records/events/port effects', async t => {
  const port = new FakePort();
  const selected: (string | undefined)[] = [];
  const registry = createHarnessRegistry(new Map([['pi', port]]), 'pi');
  const daemon = await listenDaemon({ token, port: 0, harness: { resolve(id) { selected.push(id); return registry.resolve(id); } } });
  t.after(async () => { await daemon.close(); await daemon.closed; });
  const client = apiClient(daemon.port, token), events = await client.stream();
  t.after(() => events.close());
  for (const body of [{}, { harness: 'pi' }, { sessionId: 'bad', harness: '' }, { sessionId: 'bad', harness: null },
    { sessionId: 'bad', harness: 1 }, { sessionId: 'bad', harness: true }, { sessionId: 'bad', harness: [] },
    { sessionId: 'bad', harness: {} }, { sessionId: 'bad', harness: 'pi', extra: 1 }, { sessionId: '..', harness: 'pi' }]) {
    assert.deepEqual(await client.request('/sessions', body, 400), { error: { code: 'schema' } });
  }
  assert.deepEqual(selected, []);
  for (const id of ['unknown', '__proto__', 'constructor', 'toString', '../pi', ' pi ']) {
    assert.deepEqual(await client.request('/sessions', { sessionId: 'bad', harness: id }, 409),
      { error: { code: 'harness-rejected' } });
  }
  assert.deepEqual(await client.request('/sessions'), []);
  assert.deepEqual(port.commands, []); assert.equal(port.emitters.size, 0); assert.deepEqual(port.stops, []);
  await client.request('/sessions', { sessionId: 'barrier' });
  await events.next(f => f.event === 'core' && f.data.type === 'session' && f.data.session.sessionId === 'barrier');
  assert.deepEqual(events.events.filter(f => f.event === 'core').map(f => f.data),
    [{ type: 'session', session: { sessionId: 'barrier', status: 'created' } }]);
});

test('daemon-routes: mixed ports, explicit identity projections and third opaque module need no backend branch', async t => {
  const pi = new FakePort(), claude = new FakePort();
  const opaqueId = ' opaque /../ module 🙂 ';
  const calls: string[] = [];
  const native = { future_record: { usage: [1, false], session_id: 'native-not-local' }, error: { opaque: ['🙂'] } };
  const third: HarnessPort = {
    async start(id, emit) { calls.push(`start:${id}`); emit({ type: 'native-record', record: native }); return { kind: 'confirmed' }; },
    async command(id, command) { calls.push(`command:${id}`); return { native, received: command }; },
    async stop(id) { calls.push(`stop:${id}`); return { kind: 'confirmed' }; },
  };
  const harness = createHarnessRegistry(new Map<string, HarnessPort>([['pi', pi], ['claude-code', claude], [opaqueId, third]]), 'pi');
  const daemon = await listenDaemon({ token, port: 0, harness });
  t.after(async () => { await daemon.close(); await daemon.closed; });
  const client = apiClient(daemon.port, token), events = await client.stream();
  t.after(() => events.close());
  const views = [{ sessionId: 'default', status: 'created' }, { sessionId: 'explicit', status: 'created', harness: 'pi' },
    { sessionId: 'claude', status: 'created', harness: 'claude-code' }, { sessionId: 'third', status: 'created', harness: opaqueId }];
  for (const view of views) {
    assert.deepEqual(await client.request('/sessions', { sessionId: view.sessionId,
      ...('harness' in view ? { harness: view.harness } : {}) }), view);
    assert.deepEqual(await client.request(`/sessions/${view.sessionId}`), view);
  }
  assert.deepEqual(await client.request('/sessions'), views);
  for (const view of views) {
    assert.deepEqual(await client.request(`/sessions/${view.sessionId}/start`, {}), { ...view, status: 'running' });
  }
  assert.deepEqual(await client.request('/sessions/third/command', { type: 'future_native', options: [false, '🙂'] }),
    { native, received: { type: 'future_native', options: [false, '🙂'] } });
  const frame = await events.next(f => f.event === 'core' && f.data.type === 'native-record');
  assert.deepEqual(frame.data, { type: 'native-record', sessionId: 'third', record: native });
  await events.next(f => f.event === 'core' && f.data.type === 'session' && f.data.session.sessionId === 'third'
    && f.data.session.status === 'running');
  for (const view of views) {
    const projected = events.events.flatMap(f => f.event === 'core' && f.data.type === 'session'
      && f.data.session.sessionId === view.sessionId ? [f.data.session] : []);
    assert.deepEqual(projected, ['created', 'starting', 'running'].map(status => ({ ...view, status })));
  }
  assert.deepEqual([...pi.emitters.keys()], ['default', 'explicit']);
  assert.deepEqual([...claude.emitters.keys()], ['claude']);
  assert.deepEqual(await client.request('/shutdown', {}), {
    stoppedSessionIds: ['default', 'explicit', 'claude', 'third'], uncertainSessionIds: [], failedSessionIds: [],
  });
  assert.deepEqual(pi.stops, ['default', 'explicit']); assert.deepEqual(claude.stops, ['claude']);
  assert.deepEqual(calls, ['start:third', 'command:third', 'stop:third']);
});
