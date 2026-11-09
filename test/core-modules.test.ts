import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SessionCore, createHarnessRegistry, type CommandResult, type CoreEvent, type HarnessEvent, type HarnessPort, type NativeCommand, type PortOutcome } from '../src/core.ts';
import { deferred, FakePort, rejectsCode } from './fake-port.ts';

function modulePort(result: CommandResult = { jsonrpc: '2.0', result: {} }) {
  const calls: { operation: string; sessionId: string; value?: unknown }[] = [];
  const emitters = new Map<string, (event: HarnessEvent) => void>();
  const port: HarnessPort = {
    async start(sessionId, emit) {
      calls.push({ operation: 'start', sessionId }); emitters.set(sessionId, emit);
      return { kind: 'confirmed' };
    },
    async command(sessionId, command) {
      calls.push({ operation: 'command', sessionId, value: command }); return result;
    },
    async reply(sessionId, reply) {
      calls.push({ operation: 'reply', sessionId, value: reply }); return { kind: 'written' };
    },
    async stop(sessionId) {
      calls.push({ operation: 'stop', sessionId }); return { kind: 'confirmed' };
    },
  };
  return { port, calls, emit: (id: string, event: HarnessEvent) => emitters.get(id)?.(event) };
}

test('core modules: legacy single-port default keeps two-field projections and native Pi result', async () => {
  const port = new FakePort(), core = new SessionCore(port);
  const seen: CoreEvent[] = []; core.subscribe(event => seen.push(event));
  assert.deepEqual(core.create('default'), { sessionId: 'default', status: 'created' });
  assert.deepEqual(seen, [{ type: 'session', session: { sessionId: 'default', status: 'created' } }]);
  assert.deepEqual(core.list(), [{ sessionId: 'default', status: 'created' }]);
  await core.start('default');
  const response = await core.command('default', { type: 'prompt' });
  assert.deepEqual(response, { type: 'response', id: 'fake-id', command: 'prompt', success: true });
  port.emit('default', { type: 'text', text: 'unchanged' });
  assert.deepEqual(seen.at(-1), { type: 'text', sessionId: 'default', text: 'unchanged' });
  assert.throws(() => core.create('not-registered', 'anything'), { code: 'harness-rejected' });
  assert.equal(core.list().length, 1);
  await core.shutdown();
});

test('core modules: registry default is a composition choice, explicit selection alone adds harness', async () => {
  const owned = modulePort();
  const core = new SessionCore(createHarnessRegistry(new Map([['chosen-default', owned.port]]), 'chosen-default'));
  const seen: CoreEvent[] = []; core.subscribe(event => seen.push(event));
  core.create('implicit'); core.create('explicit', 'chosen-default');
  assert.deepEqual(core.list(), [
    { sessionId: 'implicit', status: 'created' },
    { sessionId: 'explicit', status: 'created', harness: 'chosen-default' },
  ]);
  assert.deepEqual(seen, core.list().map(session => ({ type: 'session', session })));
  await core.shutdown();
  const missingDefault = new SessionCore(createHarnessRegistry(new Map([['present', owned.port]]), 'absent'));
  const missingEvents: CoreEvent[] = []; missingDefault.subscribe(event => missingEvents.push(event));
  assert.throws(() => missingDefault.create('s'), { code: 'harness-rejected' });
  assert.deepEqual(missingDefault.list(), []); assert.deepEqual(missingEvents, []);
  assert.deepEqual(owned.calls, []);
  await missingDefault.shutdown();
});

test('core modules: opaque third ID and native result without Pi keys are detached and frozen', async () => {
  const native = { jsonrpc: '2.0', result: { values: [1, { future: true }] }, extra: { usage: 42 } };
  const third = modulePort(native);
  const ports = new Map<string, HarnessPort>([
    ['one', new FakePort()], ['two', modulePort().port], ['opaque/third:λ', third.port],
  ]);
  const core = new SessionCore(createHarnessRegistry(ports, 'one'));
  const seen: CoreEvent[] = []; core.subscribe(event => seen.push(event));
  const created = core.create('third', 'opaque/third:λ');
  assert.deepEqual(created, { sessionId: 'third', status: 'created', harness: 'opaque/third:λ' });
  assert.ok(Object.isFrozen(created));
  assert.deepEqual(seen, [{ type: 'session', session: created }]);
  await core.start('third');
  const command = { type: 'native-input', params: { values: [2] } };
  const result = await core.command('third', command);
  assert.deepEqual(result, native); assert.notEqual(result, native);
  assert.deepEqual(Object.keys(result), ['jsonrpc', 'result', 'extra']);
  assert.ok(Object.isFrozen(result));
  assert.throws(() => (result.result as { values: unknown[] }).values.push('mutate'));
  native.result.values.push(9);
  assert.notDeepEqual(result, native);
  assert.deepEqual(third.calls[1].value, command);
  assert.notEqual(third.calls[1].value, command);
  assert.throws(() => ((third.calls[1].value as typeof command).params.values).push(3));
  assert.deepEqual(core.get('third'), { sessionId: 'third', status: 'running', harness: 'opaque/third:λ' });
  assert.deepEqual(core.list(), [core.get('third')]);
  await core.shutdown();
});

test('core modules: create pins each port before publish and registry mutation cannot rebind it', async () => {
  const first = modulePort(), second = modulePort({ kind: 'written' }), replacement = modulePort();
  const ports = new Map<string, HarnessPort>([['first', first.port], ['second', second.port]]);
  const core = new SessionCore(createHarnessRegistry(ports, 'first'));
  let starting: Promise<unknown> | undefined;
  core.subscribe(event => {
    if (event.type === 'session' && event.session.sessionId === 'explicit' && event.session.status === 'created') {
      ports.set('second', replacement.port);
      starting = core.start('explicit');
    }
  });
  assert.deepEqual(core.create('default'), { sessionId: 'default', status: 'created' });
  core.create('explicit', 'second'); await starting;
  ports.set('first', replacement.port); ports.delete('second');
  await core.start('default');
  await core.command('default', { type: 'custom' });
  assert.deepEqual(await core.command('explicit', { type: 'user' }), { kind: 'written' });
  const reply = { requestId: 'q', method: 'input', value: 'explicit' } as const;
  await core.reply('explicit', reply); await core.reply('default', reply);
  await core.stop('explicit');
  core.create('future'); await core.start('future');
  assert.deepEqual(await core.shutdown(), {
    stoppedSessionIds: ['default', 'future'], uncertainSessionIds: [], failedSessionIds: [],
  });
  assert.deepEqual(first.calls.map(call => [call.operation, call.sessionId]),
    ['start', 'command', 'reply', 'stop'].map(operation => [operation, 'default']));
  assert.deepEqual(second.calls.map(call => [call.operation, call.sessionId]),
    ['start', 'command', 'reply', 'stop'].map(operation => [operation, 'explicit']));
  assert.deepEqual(replacement.calls.map(call => [call.operation, call.sessionId]),
    ['start', 'stop'].map(operation => [operation, 'future']));
});

test('core modules: unknown IDs including inherited names have no create/event/backend effects', async () => {
  const owned = modulePort(), ports = new Map([['default', owned.port]]);
  const core = new SessionCore(createHarnessRegistry(ports, 'default'));
  const seen: CoreEvent[] = []; core.subscribe(event => seen.push(event));
  for (const id of ['absent', 'constructor', '__proto__', 'toString', 'hasOwnProperty', '']) {
    assert.throws(() => core.create('attempt', id), { code: 'harness-rejected' });
    assert.deepEqual(core.list(), []);
    assert.throws(() => core.get('attempt'), { code: 'session-not-found' });
    assert.deepEqual(seen, []); assert.deepEqual(owned.calls, []);
  }
  core.create('attempt');
  assert.throws(() => core.create('attempt', 'absent'), { code: 'duplicate-session' });
  assert.equal(seen.length, 1);
  // Opaque names may also be explicitly registered; no inherited-property allowlist.
  ports.set('__proto__', owned.port);
  assert.equal(core.create('registered-name', '__proto__').harness, '__proto__');
  assert.deepEqual(await core.shutdown(), {
    stoppedSessionIds: ['attempt', 'registered-name'], uncertainSessionIds: [], failedSessionIds: [],
  });
  assert.deepEqual(owned.calls, []); // Never-started sessions stop locally.
});

test('core modules: failed and unknown starts retain their original cleanup port', async () => {
  const failed = new FakePort(), unknown = new FakePort(), unrelated = new FakePort();
  failed.startOutcome = { kind: 'rejected' }; unknown.startOutcome = { kind: 'unknown' };
  const ports = new Map<string, HarnessPort>([['a', failed], ['b', unknown]]);
  const core = new SessionCore(createHarnessRegistry(ports, 'a'));
  core.create('failed'); core.create('unknown', 'b');
  await rejectsCode(core.start('failed'), 'harness-rejected');
  await rejectsCode(core.start('unknown'), 'harness-unknown');
  const seen: CoreEvent[] = []; core.subscribe(event => seen.push(event));
  failed.emit('failed', { type: 'native-record', record: { late: ['failed'] } });
  unknown.emit('unknown', { type: 'native-record', record: { late: ['unknown'] } });
  assert.deepEqual(seen, []);
  ports.set('a', unrelated); ports.set('b', unrelated);
  await core.stop('failed');
  assert.deepEqual(await core.shutdown(), {
    stoppedSessionIds: ['unknown'], uncertainSessionIds: [], failedSessionIds: [],
  });
  assert.deepEqual(failed.stops, ['failed']);
  assert.deepEqual(unknown.stops, ['unknown']);
  assert.deepEqual(unrelated.stops, []);
});

test('core modules: local written and full native errors remain native, without a response envelope', async () => {
  const written = modulePort({ kind: 'written' });
  const errorRecord = { type: 'control_response', response: { subtype: 'error', request_id: 'r',
    error: 'native refusal', extra: [1] }, metadata: { usage: { tokens: 12 } }, is_error: true };
  const error = modulePort(errorRecord);
  const core = new SessionCore(createHarnessRegistry(
    new Map([['writer', written.port], ['responder', error.port]]), 'writer'));
  core.create('written'); core.create('error', 'responder');
  await Promise.all([core.start('written'), core.start('error')]);
  const result = await core.command('written', { type: 'user', message: { content: 'input' } });
  assert.deepEqual(result, { kind: 'written' });
  assert.ok(Object.isFrozen(result));
  assert.deepEqual(await core.command('error', { type: 'control_request' }), errorRecord);
  assert.deepEqual(await core.shutdown(), {
    stoppedSessionIds: ['written', 'error'], uncertainSessionIds: [], failedSessionIds: [],
  });
});

test('core modules: waiting for a native result does not serialize commands/replies or invent ACKs', async () => {
  const owned = modulePort(), waiting = deferred<CommandResult | null>();
  const commands: NativeCommand[] = [];
  owned.port.command = async (_id, command) => {
    commands.push(command);
    return command.type === 'waiting' ? waiting.promise : { kind: 'written' };
  };
  const core = new SessionCore(createHarnessRegistry(new Map([['opaque', owned.port]]), 'opaque'));
  core.create('s'); await core.start('s');
  const pending = core.command('s', { type: 'waiting' });
  const lost = rejectsCode(pending, 'harness-unknown');
  assert.deepEqual(await core.command('s', { type: 'interrupt' }), { kind: 'written' });
  assert.deepEqual(await core.reply('s', { requestId: 'q', method: 'confirm', confirmed: true }), { kind: 'written' });
  assert.deepEqual(commands.map(command => command.type), ['waiting', 'interrupt']);
  waiting.resolve(null); await lost;
  assert.deepEqual(commands.map(command => command.type), ['waiting', 'interrupt']);
  await core.shutdown();
});

for (const outcome of ['confirmed', 'unknown'] as const) {
  test(`core modules: selected port stop ${outcome} cannot be resurrected by late start/native-record`, async () => {
    const owned = modulePort(), other = modulePort();
    const starting = deferred<PortOutcome>(), stopping = deferred<PortOutcome>();
    let emit!: (event: HarnessEvent) => void;
    owned.port.start = async (_id, publish) => { emit = publish; return starting.promise; };
    owned.port.stop = () => stopping.promise;
    const core = new SessionCore(createHarnessRegistry(new Map([['selected', owned.port], ['other', other.port]]), 'other'));
    core.create('s', 'selected');
    const start = core.start('s');
    const seen: CoreEvent[] = []; core.subscribe(event => seen.push(event));
    const record = { type: 'native-record', record: { future: [1] } } as const;
    emit(record); assert.equal(seen.length, 1); // Starting source is valid.
    const stop = core.stop('s');
    const checked = outcome === 'confirmed' ? stop : rejectsCode(stop, 'harness-unknown');
    emit(record); assert.equal(seen.length, 1); // Stop gate is synchronous.
    stopping.resolve({ kind: outcome }); await checked;
    const length = seen.length;
    starting.resolve({ kind: 'confirmed' }); await start;
    emit(record); assert.equal(seen.length, length);
    assert.equal(core.get('s').status, outcome === 'confirmed' ? 'stopped' : 'unknown');
    assert.deepEqual(other.calls, []);
    owned.port.stop = async () => ({ kind: 'confirmed' }); await core.shutdown();
  });
}

test('core modules: native-record payloads are full immutable snapshots with FIFO session routing', async () => {
  const a = modulePort(), b = modulePort();
  const core = new SessionCore(createHarnessRegistry(new Map([['a', a.port], ['b', b.port]]), 'a'));
  core.create('a'); core.create('b', 'b'); await Promise.all([core.start('a'), core.start('b')]);
  const native = { jsonrpc: '2.0', result: { arbitrary: ['whole'] }, extra: { cost: 12 },
    session_id: 'native-identity-is-not-routing', request_id: 'native-id', usage: { tokens: 7 } };
  const seen: string[] = [];
  const events: Extract<CoreEvent, { type: 'native-record' }>[] = [];
  core.subscribe(event => {
    if (event.type !== 'native-record') return;
    seen.push(`first:${event.sessionId}`); events.push(event);
    if (event.sessionId === 'a') b.emit('b', { type: 'native-record', record: native });
  });
  core.subscribe(event => { if (event.type === 'native-record') seen.push(`second:${event.sessionId}`); });
  a.emit('a', { type: 'native-record', record: native });
  assert.deepEqual(seen, ['first:a', 'second:a', 'first:b', 'second:b']);
  assert.deepEqual(events, ['a', 'b'].map(sessionId => ({ type: 'native-record', sessionId, record: native })));
  for (const event of events) {
    assert.ok(Object.isFrozen(event)); assert.ok(Object.isFrozen(event.record));
    assert.throws(() => (event.record.result as { arbitrary: string[] }).arbitrary.push('mutated'));
    assert.notEqual(event.record, native);
  }
  native.result.arbitrary.push('changed after emit');
  assert.notDeepEqual(events[0].record, native);
  await core.stop('a');
  a.emit('a', { type: 'native-record', record: native });
  assert.equal(seen.length, 4);
  b.emit('b', { type: 'native-record', record: native });
  assert.deepEqual(seen.slice(-2), ['first:b', 'second:b']);
  await core.shutdown();
});
