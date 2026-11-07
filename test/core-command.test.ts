import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CoreError, SessionCore, type CoreEvent, type NativeResponse, type PortOutcome } from '../src/core.ts';
import { deferred, FakePort, rejectsCode, running } from './fake-port.ts';

test('core.command: concurrent full responses are not run or input outcomes', async () => {
  const { core, port } = await running();
  const a = deferred<NativeResponse | null>(), b = deferred<NativeResponse | null>();
  port.commandOperation = command => command.type === 'compact' ? a.promise : b.promise;
  const first = core.command('s1', { type: 'compact', customInstructions: 'all' });
  const second = core.command('s1', { type: 'prompt', message: 'busy', streamingBehavior: 'steer' });
  const response: NativeResponse = { type: 'response', id: 'b', command: 'prompt', success: false,
    error: 'native refusal', optional: { details: [1] } };
  b.resolve(response);
  assert.deepEqual(await second, response);
  a.resolve({ type: 'response', id: 'a', command: 'compact', success: true,
    data: { summary: 'whole', usage: { tokens: 12 } } });
  assert.equal((await first).id, 'a');
  assert.deepEqual(core.get('s1'), { sessionId: 's1', status: 'running' });
  assert.deepEqual(port.commands.map(call => call.command.type), ['compact', 'prompt']);
  await core.shutdown();
});

test('core.command: detached immutable parameters/responses and safe loss errors', async () => {
  const { core, port } = await running();
  const command = { type: 'unknown_new_command', arbitrary: { values: [1] } };
  const reply: NativeResponse = { type: 'response', id: 'r', command: command.type, success: true, data: { values: [2] } };
  port.commandOperation = async received => {
    assert.notEqual(received, command);
    assert.throws(() => (received.arbitrary as { values: number[] }).values.push(3));
    return reply;
  };
  const result = await core.command('s1', command);
  assert.deepEqual(result, reply); assert.notEqual(result, reply);
  assert.throws(() => (result.data as { values: number[] }).values.push(3));
  for (const mode of ['null', 'throw', 'unsupported'] as const) {
    port.commandOperation = async () => {
      if (mode === 'throw') throw new Error('private diagnostics');
      if (mode === 'unsupported') throw new CoreError('harness-rejected');
      return null;
    };
    await rejectsCode(core.command('s1', { type: 'compact' }), mode === 'unsupported' ? 'harness-rejected' : 'harness-unknown');
  }
  assert.equal(port.commands.length, 4); // No automatic proof, restart or retry.
  await core.shutdown();
});

for (const outcome of ['confirmed', 'unknown', 'rejected'] as const) {
  for (const ackFirst of [false, true]) {
    test(`core lifecycle: stop ${outcome}, start ACK ${ackFirst ? 'before' : 'after'} stop`, async () => {
      const port = new FakePort(), core = new SessionCore(port);
      const start = deferred<PortOutcome>(), stop = deferred<PortOutcome>();
      port.start = async (id, emit) => { port.emitters.set(id, emit); return start.promise; };
      port.stop = async () => stop.promise;
      core.create('s');
      const starting = core.start('s');
      const stopping = core.stop('s');
      const checked = outcome === 'confirmed' ? stopping : rejectsCode(stopping,
        outcome === 'unknown' ? 'harness-unknown' : 'harness-rejected');
      if (ackFirst) { start.resolve({ kind: 'confirmed' }); assert.equal((await starting).status, 'starting'); }
      stop.resolve({ kind: outcome }); await checked;
      start.resolve({ kind: 'confirmed' }); await starting;
      assert.equal(core.get('s').status, outcome === 'rejected' ? 'running' : outcome === 'confirmed' ? 'stopped' : 'unknown');
      const seen: CoreEvent[] = []; core.subscribe(event => seen.push(event));
      port.emit('s', { type: 'text', text: 'late' });
      assert.equal(seen.length, outcome === 'rejected' ? 1 : 0);
      port.stop = async () => ({ kind: 'confirmed' }); await core.shutdown();
    });
  }
}

test('core lifecycle: local projections, admission, reentrant shutdown and no legacy input controller', async () => {
  const port = new FakePort(), core = new SessionCore(port);
  core.create('s');
  assert.throws(() => core.create('s'), { code: 'duplicate-session' });
  await rejectsCode(core.command('s', { type: 'prompt' }), 'invalid-state');
  await rejectsCode(core.command('absent', { type: 'prompt' }), 'session-not-found');
  await core.start('s'); await rejectsCode(core.start('s'), 'invalid-state');
  const listed = core.list();
  assert.throws(() => Object.assign(listed[0], { status: 'stopped' }));
  const waiting = deferred<NativeResponse | null>(); port.commandOperation = () => waiting.promise;
  const command = core.command('s', { type: 'compact' });
  const lost = rejectsCode(command, 'harness-unknown');
  let nested: Promise<unknown> | undefined;
  core.subscribe(event => { if (event.type === 'session' && event.session.status === 'stopped') nested = core.shutdown(); });
  const shutdown = core.shutdown(); await shutdown;
  assert.equal(nested, shutdown); assert.equal(core.shutdown(), shutdown);
  waiting.resolve(null); await lost;
  for (const operation of [() => core.create('x'), () => core.get('s'), () => core.list(), () => core.subscribe(() => {})]) {
    assert.throws(operation, { code: 'closed' });
  }
  for (const operation of [core.start('s'), core.stop('s'), core.command('s', { type: 'abort' }),
    core.reply('s', { requestId: 'q', method: 'input', value: 'x' })]) await rejectsCode(operation, 'closed');
});
