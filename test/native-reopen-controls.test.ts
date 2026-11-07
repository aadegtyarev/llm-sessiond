import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { SessionCore } from '../src/core.ts';
import { createPiHarness } from '../src/pi-harness.ts';
import { NativeRegistry } from '../src/native-registry.ts';
import { until } from './pi-observation.ts';
import type { CoreEvent, ReplyOutcome, SessionRecord } from '../src/types.ts';
import { blockWrites, metadataPath, nativeFixture, nativeHeader, NativePort } from './native-support.ts';

async function fixture(t: TestContext, target = 'one', options: object = {}, version = 3) {
  const root = mkdtempSync(join(tmpdir(), 'native-reopen-'));
  const f = { root, options: { stateDir: join(root, 'state'), nativeSessionDir: join(root, 'native') } };
  mkdirSync(f.options.nativeSessionDir);
  const cores: SessionCore[] = [];
  const optionsFile = join(f.root, 'startup-options.json');
  writeFileSync(optionsFile, JSON.stringify(options));
  const file = join(f.options.nativeSessionDir, 'owned.jsonl');
  const header = { ...JSON.parse(nativeHeader(undefined, f.root)), version };
  const entries = [{ type: 'model_change', id: 'model', parentId: null, provider: 'fixture', modelId: target },
    { type: 'thinking_level_change', id: 'thinking', parentId: 'model', thinkingLevel: target === 'two' ? 'off' : 'high' }];
  const bytes = [header, ...entries.map(({ id, parentId, ...entry }) => version === 1 ? entry : { ...entry, id, parentId })]
    .map(entry => JSON.stringify(entry)).join('\n') + '\n';
  writeFileSync(file, bytes);
  const events: CoreEvent[] = [];
  const open = () => {
    const harness = createPiHarness({ executable: process.execPath, cwd: f.root,
      prefixArgs: [fileURLToPath(new URL('./native-history-child.ts', import.meta.url)), f.root, 'sdk-like'] });
    const core = new SessionCore(harness, { ...f.options, cwd: f.root });
    core.subscribe(event => events.push(event)); cores.push(core); return core;
  };
  const core = open(); core.register('s', header.id);
  const metadata = () => JSON.parse(readFileSync(metadataPath(f.options.stateDir), 'utf8'));
  const phases = () => readdirSync(f.root).filter(name => name.endsWith('.controls'))
    .flatMap(name => readFileSync(join(f.root, name), 'utf8').trim().split('\n'));
  t.after(async () => {
    try {
      for (const core of cores) await core.shutdown();
      for (const name of readdirSync(f.root).filter(name => name.endsWith('.health'))) {
        assert.equal(readFileSync(join(f.root, name), 'utf8'), 'healthy');
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  return { ...f, core, file, bytes, events, open, metadata, phases, configure: (value: object) => writeFileSync(optionsFile, JSON.stringify(value)) };
}

test('native-reopen: controls-only SDK-like defaults are restored exactly before READY; clean daemon reopen', async t => {
  const f = await fixture(t, 'two');
  let beforeLaunch: { reference: { prefixByteLength: number }; fileBytes: string; version: number } | undefined;
  const save = NativeRegistry.prototype.save;
  t.mock.method(NativeRegistry.prototype, 'save', function (this: NativeRegistry, record: SessionRecord) {
    save.call(this, record);
    if (record.status === 'starting') {
      const data = f.metadata();
      beforeLaunch = { reference: data.native.startupReference, fileBytes: readFileSync(f.file, 'utf8'), version: data.version };
    }
  });
  assert.equal((await f.core.start('s')).status, 'running');
  assert.ok(beforeLaunch);
  assert.equal(beforeLaunch.version, 2);
  assert.equal(beforeLaunch.reference.prefixByteLength, Buffer.byteLength(f.bytes));
  assert.equal(beforeLaunch.fileBytes, f.bytes); // Durable prefix barrier precedes even SDK startup appends.
  const settings = await f.core.settings('s');
  assert.equal(settings.kind, 'confirmed');
  if (settings.kind !== 'confirmed') throw new Error();
  assert.equal(settings.value.model?.id, 'two'); assert.equal(settings.value.thinkingLevel, 'off');
  assert.equal(readFileSync(f.file, 'utf8').startsWith(f.bytes), true);
  assert.equal(f.phases().includes('user-prompt'), false);
  assert.equal(f.phases().filter(phase => phase === 'set_model').length, 1);
  assert.equal(f.metadata().version, 2); assert.equal(f.metadata().native.startupReference, undefined);
  await f.core.stop('s'); await f.core.shutdown();
  const count = f.phases().length;
  const restored = f.open(); assert.equal(f.phases().length, count); // No automatic child/recovery.
  assert.equal((await restored.start('s')).status, 'running');
  assert.deepEqual(await restored.settings('s'), settings);
  await restored.stop('s');
});

test('native-reopen: guarded startup preserves explicit reentrant reply and ordered idle barrier', async t => {
  const f = await fixture(t, 'one', { startupQuestion: true });
  let reply: Promise<ReplyOutcome> | undefined;
  f.core.subscribe(event => {
    if (event.type === 'question') reply = f.core.reply('s', { requestId: event.question.requestId, method: 'confirm', confirmed: true });
  });
  assert.equal((await f.core.start('s')).status, 'running');
  assert.ok(reply); assert.deepEqual(await reply, { kind: 'written' });
  assert.equal(f.phases().filter(phase => phase === 'extension_ui_response').length, 1);
  const settings = await f.core.settings('s'); assert.equal(settings.kind, 'confirmed');
  if (settings.kind !== 'confirmed') throw new Error();
  assert.equal(settings.value.thinkingLevel, 'high');
  assert.deepEqual(await f.core.reply('s', { requestId: 'startup-question', method: 'confirm', confirmed: true }), { kind: 'rejected' });
  await f.core.stop('s');
});

for (const version of [1, 2]) {
  test(`native-reopen: healthy legacy v${version} native migration may clear the original pin after exact readback`, async t => {
    const f = await fixture(t, 'one', {}, version);
    assert.equal((await f.core.start('s')).status, 'running');
    const settings = await f.core.settings('s');
    assert.equal(settings.kind, 'confirmed'); if (settings.kind !== 'confirmed') throw new Error();
    assert.equal(settings.value.model?.id, 'one'); assert.equal(settings.value.thinkingLevel, 'high');
    assert.equal(f.phases().includes('native-migration'), true);
    assert.equal(readFileSync(f.file, 'utf8').startsWith(f.bytes), false);
    assert.equal(f.metadata().native.startupReference, undefined);
    await f.core.stop('s'); await f.core.start('s');
    assert.deepEqual(await f.core.settings('s'), settings);
    await f.core.stop('s');
  });
}

for (const fault of ['unsupported', 'save']) {
  test(`native-reopen: failed migrated prefix (${fault}) remains pinned and retry cannot adopt rewritten bytes`, async t => {
    const f = await fixture(t, 'one', fault === 'unsupported' ? { levels: ['off'] } : {}, 1);
    if (fault === 'save') {
      const save = NativeRegistry.prototype.save;
      t.mock.method(NativeRegistry.prototype, 'save', function (this: NativeRegistry, record: SessionRecord) {
        if (record.status === 'running') throw new Error('owned readiness fault');
        save.call(this, record);
      });
    }
    await assert.rejects(f.core.start('s'));
    const reference = f.metadata().native.startupReference;
    assert.equal(reference.prefixByteLength, Buffer.byteLength(f.bytes));
    assert.equal(f.phases().includes('native-migration'), true);
    await f.core.stop('s'); await f.core.shutdown();
    assert.deepEqual(f.metadata().native.startupReference, reference);
    const phases = f.phases().length, changed = readFileSync(f.file, 'utf8');
    const other = f.open(); f.configure({});
    await assert.rejects(other.start('s'), { code: 'native-invalid' });
    assert.equal(f.phases().length, phases); // No automatic repair, replacement child or tail adoption.
    assert.equal(readFileSync(f.file, 'utf8'), changed);
  });
}

for (const fault of ['unsupported', 'clamp', 'auth', 'unavailable'] as const) {
  test(`native-reopen: ${fault} after SDK append retains ORIGINAL pin through stop/retry/new daemon`, async t => {
    const options = fault === 'unsupported' ? { levels: ['off'] } : fault === 'clamp' ? { clamp: true }
      : fault === 'auth' ? { auth: false } : { unavailable: true };
    const f = await fixture(t, 'one', options);
    await assert.rejects(f.core.start('s'), { code: 'harness-unknown' });
    assert.equal(f.core.get('s').status, 'unknown');
    assert.equal(f.events.some(event => event.type === 'session' && event.session.status === 'running'), false);
    const reference = f.metadata().native.startupReference;
    assert.equal(reference.prefixByteLength, Buffer.byteLength(f.bytes));
    assert.deepEqual(Object.keys(reference).sort(), ['prefixByteLength', 'sha256']);
    assert.equal(readFileSync(f.file, 'utf8').length > f.bytes.length, true); // A REAL failure tail exists.
    assert.equal(f.phases().includes('user-prompt'), false);
    if (fault === 'unavailable') assert.equal(f.phases().includes('set_model'), false);
    await assert.rejects(f.core.send('s', 'blocked', 'must-not-write'), { code: 'invalid-state' });
    await f.core.stop('s');
    assert.deepEqual(f.metadata().native.startupReference, reference);
    f.configure({});
    let retry = f.core;
    if (fault !== 'clamp') { await f.core.shutdown(); retry = f.open(); }
    assert.equal((await retry.start('s')).status, 'running');
    const actual = await retry.settings('s');
    assert.equal(actual.kind, 'confirmed'); if (actual.kind !== 'confirmed') throw new Error();
    assert.equal(actual.value.model?.id, 'one'); assert.equal(actual.value.thinkingLevel, 'high');
    assert.equal(f.metadata().native.startupReference, undefined);
    assert.equal(readFileSync(f.file, 'utf8').startsWith(f.bytes), true);
    await retry.stop('s');
  });
}

test('native-reopen: missing virtual selection never falls back to routed physical response; explicit recovery restores router', async t => {
  const physical = { provider: 'fixture', id: 'one', api: 'physical' };
  const f = await fixture(t, 'router', { models: [physical] });
  appendFileSync(f.file, JSON.stringify({ type: 'message', id: 'response', parentId: 'thinking',
    message: { role: 'assistant', api: 'physical', provider: 'fixture', model: 'one', content: [] } }) + '\n');
  const bytes = readFileSync(f.file, 'utf8');
  await assert.rejects(f.core.start('s'), { code: 'harness-unknown' });
  const reference = f.metadata().native.startupReference;
  assert.equal(reference.prefixByteLength, Buffer.byteLength(bytes));
  assert.equal(f.phases().includes('set_model'), false); // Physical one IS available, but is not a safe replacement.
  await f.core.stop('s'); await f.core.shutdown();
  assert.deepEqual(f.metadata().native.startupReference, reference);
  f.configure({ models: [physical, { provider: 'fixture', id: 'router', api: 'pi-virtual' }] });
  const retry = f.open(); await retry.start('s');
  const settings = await retry.settings('s'); assert.equal(settings.kind, 'confirmed');
  if (settings.kind !== 'confirmed') throw new Error();
  assert.equal(settings.value.model?.id, 'router'); assert.equal(settings.value.thinkingLevel, 'high');
  assert.equal(f.metadata().native.startupReference, undefined);
  await retry.stop('s');
});

test('native-reopen: prefix intent save failure prevents child effects and supports explicit retry', async t => {
  const f = await fixture(t);
  const unblock = blockWrites(f.options.stateDir);
  try { await assert.rejects(f.core.start('s'), { code: 'storage-failed' }); }
  finally { unblock(); }
  assert.deepEqual(f.phases(), []); assert.equal(readFileSync(f.file, 'utf8'), f.bytes);
  assert.equal((await f.core.start('s')).status, 'running');
  await f.core.stop('s');
});

test('native-reopen: readiness metadata failure retains pin through owned stop and clean restart', async t => {
  const f = await fixture(t);
  const save = NativeRegistry.prototype.save;
  let fail = true;
  t.mock.method(NativeRegistry.prototype, 'save', function (this: NativeRegistry, record: SessionRecord) {
    if (record.status === 'running' && fail) { fail = false; throw new Error('owned save fault'); }
    return save.call(this, record);
  });
  await assert.rejects(f.core.start('s'));
  assert.equal(f.core.get('s').status, 'unknown');
  const reference = f.metadata().native.startupReference;
  assert.equal(reference.prefixByteLength, Buffer.byteLength(f.bytes));
  assert.equal((await f.core.stop('s')).status, 'stopped');
  assert.deepEqual(f.metadata().native.startupReference, reference);
  await f.core.shutdown();
  const other = f.open(); await other.start('s');
  const settings = await other.settings('s'); assert.equal(settings.kind, 'confirmed');
  if (settings.kind !== 'confirmed') throw new Error();
  assert.equal(settings.value.thinkingLevel, 'high');
  await other.stop('s');
});

for (const status of ['created', 'stopped', 'running'] as const) {
  test(`native-reopen: legitimate v1 ${status} metadata keeps S1 ownership semantics`, async t => {
    const f = nativeFixture(t);
    f.core.create('s'); if (status === 'stopped') await f.core.stop('s');
    const path = metadataPath(f.options.stateDir);
    const data = JSON.parse(readFileSync(path, 'utf8')); data.version = 1; data.status = status;
    await f.core.shutdown(); writeFileSync(path, JSON.stringify(data));
    const port = new NativePort(), restored = new SessionCore(port, f.options);
    if (status === 'running') {
      assert.equal(restored.get('s').status, 'unknown');
      await assert.rejects(restored.start('s'), { code: 'invalid-state' });
      await assert.rejects(restored.stop('s'), { code: 'harness-unknown' });
      assert.equal(port.starts, 0); assert.deepEqual(port.stops, []);
    } else {
      assert.equal(restored.get('s').status, status);
      await restored.start('s'); assert.equal(port.starts, 1);
      assert.equal(JSON.parse(readFileSync(path, 'utf8')).version, 2);
      await restored.stop('s');
    }
    await restored.shutdown();
  });
}

for (const fault of ['v1-intent', 'unknown-version', 'bad-ref', 'extra-ref-field', 'unknown-field']) {
  test(`native-reopen: ${fault} registry fails closed without reset`, async t => {
    const f = nativeFixture(t); f.core.create('s'); await f.core.start('s'); await f.core.stop('s');
    const path = metadataPath(f.options.stateDir), data = JSON.parse(readFileSync(path, 'utf8'));
    await f.core.shutdown();
    if (fault === 'unknown-version') data.version = 3;
    else if (fault === 'unknown-field') data.unapproved = true;
    else { data.native.startupReference = { prefixByteLength: 1, sha256: '0'.repeat(64) };
      if (fault === 'v1-intent') data.version = 1;
      if (fault === 'bad-ref') data.native.startupReference.prefixByteLength = -1;
      if (fault === 'extra-ref-field') data.native.startupReference.model = 'shadow';
    }
    const bytes = JSON.stringify(data); writeFileSync(path, bytes);
    assert.throws(() => new SessionCore(new NativePort(), f.options), { code: 'storage-failed' });
    assert.equal(readFileSync(path, 'utf8'), bytes);
  });
}

for (const field of ['foreign', 'foreignPath']) {
 for (const active of [false, true]) {
 test(`native-reopen: proven runtime ${field}, active=${active}, fences send/text and preserves own uncertainty`, async t => {
  // NEW first launch uses S1 initialization; the second native state query proves ownership loss.
  const f = await fixture(t, 'one', { [field]: true });
  // Use a fresh NEW record so startup restoration is not the query under test.
  f.core.create('new'); await f.core.start('new');
  if (active) {
    await f.core.send('new', 'own-active', 'fixture:wait-controls');
    await until(() => f.events.some(event => event.type === 'tool' && event.toolCallId === 'wait-controls'), 'owned active boundary');
    assert.equal(f.core.get('new').input?.status, 'pending');
  }
  assert.deepEqual(await f.core.settings('new'), { kind: 'unknown' });
  assert.equal(f.core.get('new').status, 'unknown');
  await assert.rejects(f.core.send('new', 'blocked', 'must-not-write'), { code: 'invalid-state' });
  assert.equal(f.events.some(event => event.type === 'text' && event.text === 'foreign-text-must-not-forward'), false);
  assert.equal(f.phases().filter(phase => phase === 'user-prompt').length, active ? 1 : 0);
  if (active) {
    assert.equal(f.core.get('new').input?.status, 'unknown');
    assert.equal(f.events.filter(event => event.type === 'input' && event.input.inputId === 'own-active' && event.input.status === 'unknown').length, 1);
  }
  await f.core.stop('new');
 });
 }
}

test('native-reopen: malformed read-only settings without ownership loss does not poison ordinary send', async t => {
  const f = await fixture(t, 'one', { malformed: true });
  f.core.create('new'); await f.core.start('new');
  assert.deepEqual(await f.core.settings('new'), { kind: 'unknown' });
  assert.equal(f.core.get('new').status, 'running');
  await f.core.send('new', 'ordinary', 'fixture-marker');
  await until(() => f.core.get('new').input?.status === 'completed', 'ordinary send after malformed read-only query');
  assert.equal(f.phases().filter(phase => phase === 'user-prompt').length, 1);
  await f.core.stop('new');
});
