import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { SessionCore } from '../src/core.ts';
import { blockWrites, metadataPath, nativeFixture, NativePort } from './native-support.ts';
import { deferred, rejectsCode } from './fake-port.ts';
import { CoreError, type NativeBinding, type PortOutcome, type SessionRecord } from '../src/types.ts';
import { NativeRegistry } from '../src/native-registry.ts';

function metadata(stateDir: string) { return JSON.parse(readFileSync(metadataPath(stateDir), 'utf8')); }

test('native durability: dirty restore is unknown, not ownership or completed; shutdown reports uncertainty', async t => {
  const { core, options, port } = nativeFixture(t);
  core.create('s'); await core.start('s');
  await core.send('s', 'used', 'private marker');
  port.emit('s', { type: 'input-completed', inputId: 'used' });
  const file = metadataPath(options.stateDir);
  const dirty = readFileSync(file, 'utf8');
  // Simulate operator-verified crash recovery: child gone, gates released, dirty snapshot retained.
  await core.shutdown();
  writeFileSync(file, dirty);
  const other = new NativePort();
  const restored = new SessionCore(other, options);
  assert.deepEqual(restored.get('s'), { sessionId: 's', status: 'unknown', input: { inputId: 'used', status: 'unknown' } });
  await rejectsCode(restored.stop('s'), 'harness-unknown');
  await rejectsCode(restored.start('s'), 'invalid-state');
  assert.deepEqual(await restored.shutdown(), { stoppedSessionIds: [], uncertainSessionIds: ['s'], failedSessionIds: [] });
  assert.deepEqual(other.stops, []); assert.equal(other.starts, 0);
  assert.equal(readFileSync(file, 'utf8').includes('private marker'), false);
});

test('native durability: clean unknown input remains unknown yet exact reopen permits new input without freeing used IDs', async t => {
  const { core, options } = nativeFixture(t);
  core.create('s'); await core.start('s');
  await core.send('s', 'old', 'uncertain');
  await core.stop('s');
  assert.equal(core.get('s').input?.status, 'unknown');
  await core.shutdown();
  const restored = new SessionCore(new NativePort(), options);
  assert.equal(restored.get('s').input?.status, 'unknown');
  await restored.start('s');
  await rejectsCode(restored.send('s', 'old', 'never replay'), 'duplicate-input');
  assert.equal((await restored.send('s', 'new', 'new input')).inputId, 'new');
  await restored.stop('s');
});

test('native durability: create intent is durable before zero-byte allocation; failure produces no allocation', t => {
  const { core, options } = nativeFixture(t);
  const unblock = blockWrites(options.stateDir);
  assert.throws(() => core.create('s'), { code: 'storage-failed' });
  assert.deepEqual(readdirSync(options.nativeSessionDir).filter(name => name.endsWith('.jsonl')), []);
  assert.deepEqual(core.list(), []);
  unblock();
  let intent: { native: NativeBinding } | undefined;
  const allocate = NativeRegistry.prototype.allocate;
  t.mock.method(NativeRegistry.prototype, 'allocate', function (this: NativeRegistry, binding: NativeBinding) {
    intent = metadata(options.stateDir);
    return allocate.call(this, binding);
  });
  core.create('s');
  assert.ok(intent);
  assert.equal(intent.native.identity, null);
  assert.equal(intent.native.nativeId, null);
  assert.equal(intent.native.fresh, true);
  const saved = metadata(options.stateDir);
  assert.equal(saved.native.nativeId, null);
  assert.ok(saved.native.identity);
  assert.equal(readFileSync(saved.native.file, 'utf8'), '');
  if (process.platform !== 'win32') assert.equal(statSync(saved.native.file).mode & 0o777, 0o600);
});

test('native durability: start intent write failure prevents resource effects and allows explicit start after recovery', async t => {
  const { core, options, port } = nativeFixture(t);
  core.create('s');
  const unblock = blockWrites(options.stateDir);
  await rejectsCode(core.start('s'), 'storage-failed');
  assert.equal(port.starts, 0);
  unblock();
  assert.equal((await core.start('s')).status, 'running');
  await core.stop('s');
});

test('native durability: input ID is saved before send and failed write prevents prompt effects', async t => {
  const { core, options, port } = nativeFixture(t);
  core.create('s'); await core.start('s');
  const unblock = blockWrites(options.stateDir);
  await rejectsCode(core.send('s', 'blocked', 'must not run'), 'storage-failed');
  assert.equal(port.sends.length, 0);
  unblock();
  let observed: unknown;
  port.sendOperation = async () => { observed = metadata(options.stateDir).inputIds; return { kind: 'confirmed' }; };
  await core.send('s', 'allowed', 'data');
  assert.deepEqual(observed, ['blocked', 'allowed']);
  await core.stop('s');
  await core.shutdown();
  const restored = new SessionCore(new NativePort(), options);
  await restored.start('s');
  await rejectsCode(restored.send('s', 'blocked', 'retry'), 'duplicate-input');
  await rejectsCode(restored.send('s', 'allowed', 'retry'), 'duplicate-input');
  await restored.stop('s');
});

test('native durability: confirmed native binding save precedes readiness; failed save still allows owned cleanup', async t => {
  const { core, options, port } = nativeFixture(t);
  core.create('s');
  const start = deferred<PortOutcome>();
  port.startOutcome = await Promise.resolve({ kind: 'confirmed' });
  const original = port.start.bind(port);
  port.start = async (...args) => { await original(...args); return start.promise; };
  const starting = core.start('s');
  const unblock = blockWrites(options.stateDir);
  start.resolve({ kind: 'confirmed' });
  await rejectsCode(starting, 'storage-failed');
  assert.equal(core.get('s').status, 'unknown');
  unblock();
  assert.equal((await core.stop('s')).status, 'stopped');
  assert.deepEqual(port.stops, ['s']);
});

test('native durability: failed clean snapshot is not stopped completion; explicit retry reuses observed stop proof', async t => {
  const { core, options, port } = nativeFixture(t);
  core.create('s'); await core.start('s');
  await core.send('s', 'a', 'data');
  port.emit('s', { type: 'input-completed', inputId: 'a' });
  const stoppedEvents: string[] = [];
  core.subscribe(event => { if (event.type === 'session') stoppedEvents.push(event.session.status); });
  const unblock = blockWrites(options.stateDir);
  await rejectsCode(core.stop('s'), 'storage-failed');
  assert.equal(core.get('s').status, 'unknown');
  assert.equal(stoppedEvents.includes('stopped'), false);
  assert.deepEqual(port.stops, ['s']);
  unblock();
  assert.equal((await core.stop('s')).status, 'stopped');
  assert.deepEqual(port.stops, ['s']);
  await core.shutdown();
  const restored = new SessionCore(new NativePort(), options);
  assert.equal(restored.get('s').status, 'stopped');
  assert.equal(restored.get('s').input?.status, 'completed');
});

test('native durability: allocation snapshot failure can be explicitly cleaned without an unnecessary latch', async t => {
  const { core, options, port } = nativeFixture(t);
  const save = NativeRegistry.prototype.save;
  let writes = 0;
  const fault = t.mock.method(NativeRegistry.prototype, 'save', function (this: NativeRegistry, session: SessionRecord) {
    if (++writes === 2) throw new CoreError('storage-failed');
    return save.call(this, session);
  });
  assert.throws(() => core.create('s'), { code: 'storage-failed' });
  fault.mock.restore();
  assert.equal(core.get('s').status, 'unknown');
  assert.equal((await core.stop('s')).status, 'stopped');
  assert.deepEqual(port.stops, []);
  assert.equal((await core.start('s')).status, 'running');
  assert.ok(metadata(options.stateDir).native.nativeId);
  await core.stop('s');
});

for (const control of ['cancel', 'reply'] as const) {
  test(`native durability: late ${control} ACK cannot cross explicit stop/reopen; in-flight control blocks delete`, async t => {
    const { core, port } = nativeFixture(t);
    core.create('s'); await core.start('s');
    await core.send('s', 'old', 'data');
    const ack = deferred<PortOutcome>();
    let task: Promise<unknown>;
    if (control === 'cancel') {
      Object.assign(port, { cancel: () => ack.promise });
      task = core.cancel('s', 'old');
    } else {
      Object.assign(port, { reply: async () => { await ack.promise; return { kind: 'written' }; } });
      task = core.reply('s', { requestId: 'q', method: 'input', value: 'data' });
    }
    await core.stop('s');
    assert.throws(() => core.delete('s'), { code: 'invalid-state' });
    await rejectsCode(core.start('s'), 'invalid-state');
    ack.resolve({ kind: 'confirmed' });
    const result = await task;
    if (control === 'reply') assert.deepEqual(result, { kind: 'unknown' });
    else assert.deepEqual(result, { inputId: 'old', status: 'unknown' });
    await core.start('s');
    assert.equal((await core.send('s', 'current', 'data')).status, 'pending');
    await core.stop('s');
  });
}

test('native durability: start ACK during rejected stop persists verified binding before running publication', async t => {
  const { core, port, options } = nativeFixture(t);
  core.create('s');
  const startAck = deferred<PortOutcome>(), stopAck = deferred<PortOutcome>();
  const nativeStart = port.start.bind(port);
  port.start = async (...args) => { await nativeStart(...args); return startAck.promise; };
  port.stop = () => stopAck.promise;
  const runningSnapshots: unknown[] = [];
  core.subscribe(event => {
    if (event.type === 'session' && event.session.status === 'running') runningSnapshots.push(metadata(options.stateDir));
  });
  const starting = core.start('s');
  const stopping = core.stop('s');
  startAck.resolve({ kind: 'confirmed' });
  assert.equal((await starting).status, 'starting');
  stopAck.resolve({ kind: 'rejected' });
  await rejectsCode(stopping, 'harness-rejected');
  assert.equal(core.get('s').status, 'running');
  const saved = metadata(options.stateDir);
  assert.equal(saved.status, 'running'); assert.ok(saved.native.nativeId);
  assert.deepEqual(runningSnapshots, [saved]);
  port.stop = async () => ({ kind: 'confirmed' });
  await core.stop('s');
});

test('native durability: old callbacks and send ACK cannot mutate reopened generation; operations fence deletion and reopen', async t => {
  const { core, port } = nativeFixture(t);
  core.create('s'); await core.start('s');
  const oldEmit = port.emitters.get('s')!;
  const ack = deferred<PortOutcome>();
  port.sendOperation = () => ack.promise;
  const sending = core.send('s', 'old', 'data');
  await core.stop('s');
  assert.throws(() => core.delete('s'), { code: 'invalid-state' });
  await rejectsCode(core.start('s'), 'invalid-state');
  ack.resolve({ kind: 'confirmed' }); await sending;
  await core.start('s');
  port.sendOperation = async () => ({ kind: 'confirmed' });
  await core.send('s', 'current', 'data');
  const events: unknown[] = []; core.subscribe(event => { events.push(event); });
  oldEmit({ type: 'text', text: 'stale' });
  oldEmit({ type: 'input-completed', inputId: 'current' });
  oldEmit({ type: 'notification', method: 'notify', message: 'stale', level: 'info' });
  assert.deepEqual(events, []);
  assert.deepEqual(core.get('s').input, { inputId: 'current', status: 'pending' });
  await core.stop('s');
});
