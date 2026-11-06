import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copyFileSync, existsSync, linkSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { metadataPath, nativeFixture, nativeHeader, NativePort } from './native-support.ts';
import { rejectsCode } from './fake-port.ts';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionCore } from '../src/core.ts';
import { FakePort } from './fake-port.ts';

test('native registry: empty and unstarted records survive without model launch', async t => {
  const root = mkdtempSync(join(tmpdir(), 'native-registry-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const options = { stateDir: join(root, 'state'), nativeSessionDir: join(root, 'native') };
  mkdirSync(options.nativeSessionDir);
  const first = new SessionCore(new FakePort(), options);
  assert.deepEqual(first.list(), []);
  first.create('empty');
  assert.equal((await first.stop('empty')).status, 'stopped');
  await first.shutdown();
  const port = new FakePort();
  const second = new SessionCore(port, options);
  assert.equal(second.get('empty').status, 'stopped');
  assert.equal(second.get('empty').input, null);
  assert.equal(port.emitters.size, 0);
  assert.equal(readFileSync(metadataPath(options.stateDir, 'empty'), 'utf8').includes('prompt'), false);
});

test('native registry: trusted UUID import and duplicate logical owner survive restart', async t => {
  const { options, core, port } = nativeFixture(t);
  const nativeId = randomUUID();
  const file = join(options.nativeSessionDir, 'import.jsonl');
  writeFileSync(file, nativeHeader(nativeId));
  assert.deepEqual(core.catalogue(), [{ nativeId }]);
  assert.equal(core.register('imported', nativeId).status, 'created');
  assert.throws(() => core.register('second', nativeId), { code: 'native-owned' });
  assert.throws(() => core.register('raw-path', file), { code: 'native-invalid' });
  await core.start('imported');
  assert.equal(port.bindings.get('imported')!.file, file);
  await core.stop('imported');
  await core.shutdown();
  const second = new SessionCore(new NativePort(), options);
  assert.throws(() => second.register('second', nativeId), { code: 'native-owned' });
  assert.equal(second.get('imported').status, 'stopped');
});

for (const kind of ['duplicate-id', 'hardlink', 'symlink-only'] as const) {
  test(`native registry: rejects ambiguous/unsafe import ${kind}`, t => {
    const { options, core, root } = nativeFixture(t);
    const nativeId = randomUUID();
    const file = join(options.nativeSessionDir, 'original.jsonl');
    const alias = join(options.nativeSessionDir, 'alias.jsonl');
    writeFileSync(file, nativeHeader(nativeId));
    if (kind === 'duplicate-id') copyFileSync(file, alias);
    if (kind === 'hardlink') linkSync(file, alias);
    if (kind === 'symlink-only') {
      const outside = join(root, 'outside.jsonl');
      copyFileSync(file, outside); unlinkSync(file); symlinkSync(outside, alias);
    }
    assert.deepEqual(core.catalogue(), []);
    assert.throws(() => core.register('unsafe', nativeId), { code: 'native-invalid' });
    assert.deepEqual(core.list(), []);
  });
}

for (const kind of ['missing', 'empty', 'bad-json', 'bad-header', 'bad-tree', 'replaced', 'symlink', 'hardlink'] as const) {
  test(`native registry: existing ${kind} history is never recreated or launched`, async t => {
    const { options, core } = nativeFixture(t);
    const nativeId = randomUUID();
    const file = join(options.nativeSessionDir, 'history.jsonl');
    writeFileSync(file, nativeHeader(nativeId));
    core.register('saved', nativeId);
    await core.stop('saved');
    if (kind === 'missing') unlinkSync(file);
    if (kind === 'empty') writeFileSync(file, '');
    if (kind === 'bad-json') writeFileSync(file, '{broken');
    if (kind === 'bad-header') writeFileSync(file, nativeHeader(randomUUID()));
    if (kind === 'bad-tree') writeFileSync(file, nativeHeader(nativeId) + JSON.stringify({ type: 'message', id: 'a', parentId: 'missing' }) + '\n');
    if (kind === 'replaced') { unlinkSync(file); writeFileSync(file, nativeHeader(nativeId)); }
    if (kind === 'symlink') { const target = `${file}.outside`; copyFileSync(file, target); unlinkSync(file); symlinkSync(target, file); }
    if (kind === 'hardlink') linkSync(file, `${file}.alias`);
    const before = existsSync(file) ? readFileSync(file, 'utf8') : null;
    await core.shutdown();
    const port = new NativePort();
    const restored = new SessionCore(port, options);
    await rejectsCode(restored.start('saved'), 'native-invalid');
    assert.equal(port.starts, 0);
    assert.equal(existsSync(file) ? readFileSync(file, 'utf8') : null, before);
  });
}

test('native registry: corrupt metadata fails closed without modifying native files', async t => {
  const { core, options } = nativeFixture(t);
  core.create('s');
  await core.shutdown();
  const native = readdirSync(options.nativeSessionDir);
  writeFileSync(metadataPath(options.stateDir), '{broken');
  assert.throws(() => new SessionCore(new NativePort(), options), { code: 'storage-failed' });
  assert.deepEqual(readdirSync(options.nativeSessionDir), native);
  assert.equal(readFileSync(join(options.nativeSessionDir, native[0]), 'utf8'), '');
});
