import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiFixture } from './api-support.ts';
import { cliProcess } from './api-cli-support.ts';
import { FakePort, deferred } from './fake-port.ts';
import type { HarnessPort, NativeResponse } from '../src/types.ts';

async function fixture(t: TestContext, port: HarnessPort) {
  const actors: ReturnType<typeof cliProcess>[] = [];
  t.after(async () => { for (const actor of actors) await actor.cleanup(); });
  const api = await apiFixture(t, port);
  const root = mkdtempSync(join(tmpdir(), 'cli lifecycle ')), config = join(root, 'private.json');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(config, JSON.stringify({ token: api.token, port: Number(new URL(api.base).port) }), { mode: 0o600 });
  const launch = (args: string[], body = '') => {
    const actor = cliProcess(['--config', config, ...args], body); actors.push(actor); return actor;
  };
  return { api, config, launch };
}

test('api-cli command: valid stdin below body limit is not expanded past the API boundary', async t => {
  const input = '{"type":"future_native","values":[' + Array(4000).fill('1e20').join(',') + ']}';
  const command = JSON.parse(input);
  assert.equal(Buffer.byteLength(input), 20035);
  assert.equal(Buffer.byteLength(JSON.stringify(command)), 88035);
  const response: NativeResponse = { id: 'boundary-r', type: 'response', command: 'future_native', success: true,
    data: { accepted: true }, metadata: { optional: ['preserved'] } };
  const port = new FakePort(); port.commandOperation = async () => response;
  const { api, launch } = await fixture(t, port); await api.running();
  const result = await launch(['command', 's'], input).done;
  assert.equal(result.code, 0); assert.equal(result.stderr, '');
  assert.equal(result.stdout, JSON.stringify(response) + '\n');
  assert.deepEqual(port.commands, [{ sessionId: 's', command }]);
  assert.deepEqual(port.stops, []);
});

test('api-cli shutdown: HTTP200 uncertainty stays whole JSON and exit0, not all-cleaned', async t => {
  const port = new FakePort(); port.stop = async () => ({ kind: 'unknown' });
  const { api, launch } = await fixture(t, port); await api.running();
  const result = await launch(['shutdown']).done;
  assert.equal(result.code, 0); assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), { stoppedSessionIds: [], uncertainSessionIds: ['s'], failedSessionIds: [] });
});

for (const kind of ['written', 'unknown', 'rejected'] as const) {
  test(`api-cli reply ${kind}: HTTP200 exit0 without Native ACK, no hidden command`, async t => {
    const port = Object.assign(new FakePort(), { reply: async () => ({ kind }) });
    const { api, launch } = await fixture(t, port); await api.running();
    const answer = { requestId: 'q'.repeat(1025), method: 'input', value: 'explicit' };
    const result = await launch(['reply', 's'], JSON.stringify(answer)).done;
    assert.equal(result.code, 0); assert.equal(result.stdout, JSON.stringify({ kind }) + '\n'); assert.equal(result.stderr, '');
    assert.deepEqual(port.commands, []); assert.deepEqual(port.stops, []);
    assert.equal((await api.request('/sessions/s')).status, 'running');
  });
}

test('api-cli auth: full API401 before effects, without token/config diagnostics', async t => {
  const port = new FakePort(); const { api, config, launch } = await fixture(t, port); await api.running();
  writeFileSync(config, JSON.stringify({ token: 'b'.repeat(43), port: Number(new URL(api.base).port) }));
  const result = await launch(['command', 's'], '{"type":"prompt","message":"not sent"}').done;
  assert.equal(result.code, 1); assert.equal(result.stdout, '{"error":{"code":"auth"}}\n'); assert.equal(result.stderr, '');
  assert.deepEqual(port.commands, []); assert.deepEqual(port.stops, []);
});

test('api-cli disconnect: killed command/events clients neither stop/retry/abort nor replay on reconnect', async t => {
  const port = new FakePort();
  const entered = deferred<void>(), gate = deferred<NativeResponse | null>(), finished = deferred<void>();
  port.commandOperation = async () => { entered.resolve(); const response = await gate.promise; finished.resolve(); return response; };
  const { api, launch } = await fixture(t, port); await api.running();
  const events = launch(['events']); const pending = launch(['command', 's'], '{"type":"compact"}');
  const response: NativeResponse = { id: 'r', type: 'response', command: 'compact', success: true, data: { summary: 'done' } };
  try {
    await events.next(f => f.event === 'ready'); await entered.promise;
    port.emit('s', { type: 'text', text: 'past' });
    await events.next(f => f.event === 'core' && f.data.type === 'text');
    await pending.cleanup(); await events.cleanup();
    assert.deepEqual(port.commands, [{ sessionId: 's', command: { type: 'compact' } }]); assert.deepEqual(port.stops, []);
    gate.resolve(response); await finished.promise;
    const current = await launch(['get', 's']).done;
    assert.equal(current.code, 0); assert.deepEqual(JSON.parse(current.stdout), { sessionId: 's', status: 'running' });
    const reconnected = launch(['events']); await reconnected.next(f => f.event === 'ready');
    port.emit('s', { type: 'text', text: 'future' });
    await reconnected.next(f => f.event === 'core' && f.data.type === 'text' && f.data.text === 'future');
    assert.equal((await launch(['stop', 's']).done).code, 0);
    await reconnected.next(f => f.event === 'core' && f.data.type === 'session' && f.data.session.status === 'stopped');
    assert.equal((await launch(['shutdown']).done).code, 0);
    const final = await reconnected.done; assert.equal(final.code, 0); assert.equal(final.stderr, '');
    assert.deepEqual(final.stdout.trimEnd().split('\n').map(line => JSON.parse(line)), [
      { event: 'ready', data: {} }, { event: 'core', data: { type: 'text', sessionId: 's', text: 'future' } },
      { event: 'core', data: { type: 'session', session: { sessionId: 's', status: 'stopped' } } },
    ]);
    assert.equal(port.commands.length, 1); assert.deepEqual(port.stops, ['s']);
  } finally { gate.resolve(response); await pending.cleanup(); await events.cleanup(); }
});
