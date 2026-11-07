import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createPiHarness } from '../src/pi-harness.ts';
import { SessionCore, type CoreEvent } from '../src/core.ts';
import { apiFixture } from './api-support.ts';
import { deferred, rejectsCode } from './fake-port.ts';

function fixture(t: TestContext) {
  const harness = createPiHarness({ executable: process.execPath,
    prefixArgs: [fileURLToPath(new URL('./translator-child.ts', import.meta.url))], stopDeadlineMs: 1000 });
  const core = new SessionCore(harness);
  t.after(async () => {
    const result = await core.shutdown();
    assert.deepEqual(result.uncertainSessionIds, []); assert.deepEqual(result.failedSessionIds, []);
  });
  return { core, harness };
}

test('pi translator: independent connections, defaults and complete response metadata', async t => {
  const { core } = fixture(t);
  for (const id of ['a', 'b']) { core.create(id); await core.start(id); }
  const a = await core.command('a', { type: 'get_state' });
  const b = await core.command('b', { type: 'get_state' });
  const state = a.data as { pid: number; argv: string[]; packageDir: unknown };
  assert.notEqual(state.pid, (b.data as { pid: number }).pid);
  assert.deepEqual(state.argv, ['--mode', 'rpc']); assert.equal(state.packageDir, null);
  assert.deepEqual(a.optionalMetadata, { fixture: true });
});

for (const disposition of ['started', 'queued', 'handled']) {
  test(`pi translator: busy ${disposition}, delayed/reverse responses and arbitrary Native command fields`, async t => {
    const { core } = fixture(t); core.create('s'); await core.start('s');
    const seen: CoreEvent[] = []; core.subscribe(event => seen.push(event));
    let done = false;
    const command = { type: 'prompt', id: 'client-cannot-own-rpc-id', message: 'text', disposition,
      delayMs: 150, observations: true, streamingBehavior: 'followUp', optional: { values: [1] } };
    const first = core.command('s', command); void first.then(() => { done = true; });
    const second = await core.command('s', { type: 'future_native_command', sessionPath: '/native/owns/this' });
    assert.equal(second.command, 'future_native_command'); assert.equal(done, false);
    const response = await first;
    assert.deepEqual(response.data, { disposition, received: { ...command, id: response.id },
      pid: (second.data as { pid: number }).pid });
    assert.notEqual(response.id, command.id);
    assert.notEqual(second.id, response.id);
    assert.equal(seen.filter(e => e.type === 'text').length, 1);
    assert.deepEqual(seen.filter(e => e.type === 'text')[0], { type: 'text', sessionId: 's', text: '🙂 fixture text' });
    assert.equal(JSON.stringify(seen).includes('private'), false);
    assert.equal(core.get('s').status, 'running');
  });
}

for (const cleanup of ['stop', 'shutdown'] as const) {
  test(`pi translator: actual ${cleanup} closes pending responses without invented Native result`, async t => {
    const { core } = fixture(t); core.create('s'); await core.start('s');
    const entered = deferred<void>();
    core.subscribe(event => { if (event.type === 'tool' && event.toolCallId === 'compact-pending') entered.resolve(); });
    const waiting = rejectsCode(core.command('s', { type: 'compact', customInstructions: 'hold' }), 'harness-unknown');
    await entered.promise;
    if (cleanup === 'stop') assert.equal((await core.stop('s')).status, 'stopped');
    else assert.deepEqual(await core.shutdown(), { stoppedSessionIds: ['s'], uncertainSessionIds: [], failedSessionIds: [] });
    await waiting;
  });
}

for (const type of ['fixture_loss', 'fixture_exit']) {
  test(`pi translator: actual ${type} maps missing response to HTTP409, then observed-exit cleanup`, async t => {
    const { harness } = fixture(t);
    const api = await apiFixture(t, harness); await api.running();
    assert.deepEqual(await api.request('/sessions/s/command', { type }, 409), { error: { code: 'harness-unknown' } });
    assert.deepEqual(await api.request('/sessions/s/command', { type: 'compact' }, 409), { error: { code: 'harness-unknown' } });
    assert.equal((await api.request('/sessions/s/stop', {})).status, 'stopped');
  });
}

test('pi translator: startup immediate reply has no fabricated RPC ACK or query fence', async t => {
  const { core } = fixture(t); core.create('s'); await core.start('s');
  const replies: Promise<unknown>[] = [];
  core.subscribe(event => {
    if (event.type === 'question') replies.push(core.reply('s', { requestId: event.question.requestId,
      method: event.question.method, cancelled: true }));
  });
  await core.command('s', { type: 'prompt', observations: true });
  assert.equal(replies.length, 3);
  assert.deepEqual(await Promise.all(replies), [{ kind: 'written' }, { kind: 'written' }, { kind: 'written' }]);
  const after = await core.command('s', { type: 'prompt', message: 'no injected streamingBehavior' });
  assert.deepEqual((after.data as { received: object }).received, { type: 'prompt', message: 'no injected streamingBehavior', id: after.id });
});
