import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { NativeRegistry } from '../src/native-registry.ts';
import type { SessionRecord } from '../src/types.ts';
import { SessionCore } from '../src/core.ts';
import { blockWrites, metadataPath, nativeFixture, nativeHeader, NativePort } from './native-support.ts';

// Faults occur at real filesystem boundaries, without changing Core's lifecycle authority.
test('native delete: durable intent failure never unlinks history', async t => {
  const { core, options, port } = nativeFixture(t);
  core.create('s'); await core.start('s'); await core.stop('s');
  const file = port.bindings.get('s')!.file;
  const before = readFileSync(file, 'utf8');
  const unblock = blockWrites(options.stateDir);
  assert.throws(() => core.delete('s'), { code: 'storage-failed' });
  assert.equal(readFileSync(file, 'utf8'), before);
  unblock(); core.delete('s');
  assert.equal(existsSync(file), false);
  assert.deepEqual(core.list(), []);
});

test('native delete: partial metadata removal is honest; restart performs no destructive recovery, explicit retry is safe', async t => {
  const { core, options, port } = nativeFixture(t);
  core.create('s'); await core.start('s'); await core.stop('s');
  const file = port.bindings.get('s')!.file;
  const metadata = metadataPath(options.stateDir);
  const held = `${metadata}.held`;
  const unrelated = join(options.nativeSessionDir, 'tool-output.txt');
  writeFileSync(unrelated, 'keep');
  let observedIntent: boolean | undefined;
  const remove = NativeRegistry.prototype.remove;
  const fault = t.mock.method(NativeRegistry.prototype, 'remove', function (this: NativeRegistry, session: SessionRecord) {
    observedIntent = JSON.parse(readFileSync(metadata, 'utf8')).deleting;
    renameSync(metadata, held); mkdirSync(metadata);
    return remove.call(this, session);
  });
  assert.throws(() => core.delete('s'), { code: 'storage-failed' });
  fault.mock.restore();
  assert.equal(observedIntent, true);
  assert.equal(existsSync(file), false);
  assert.equal(core.get('s').status, 'stopped');
  rmSync(metadata, { recursive: true }); renameSync(held, metadata);
  await core.shutdown();
  const restored = new SessionCore(new NativePort(), options);
  assert.equal(restored.get('s').status, 'stopped');
  assert.equal(existsSync(metadata), true); // No destructive startup cleanup.
  await assert.rejects(restored.start('s'), { code: 'invalid-state' });
  restored.delete('s');
  assert.deepEqual(restored.list(), []);
  assert.equal(readFileSync(unrelated, 'utf8'), 'keep');
});

test('native delete: replacement after partial unlink is not deleted on explicit retry', async t => {
  const { core, options, port } = nativeFixture(t);
  core.create('s'); await core.start('s'); await core.stop('s');
  const binding = port.bindings.get('s')!;
  const metadata = metadataPath(options.stateDir);
  const saved = JSON.parse(readFileSync(metadata, 'utf8'));
  saved.deleting = true; writeFileSync(metadata, JSON.stringify(saved));
  rmSync(binding.file);
  writeFileSync(binding.file, nativeHeader());
  const replacement = readFileSync(binding.file, 'utf8');
  await core.shutdown();
  const restored = new SessionCore(new NativePort(), options);
  assert.throws(() => restored.delete('s'), { code: 'native-invalid' });
  assert.equal(readFileSync(binding.file, 'utf8'), replacement);
  assert.equal(existsSync(metadata), true);
});
