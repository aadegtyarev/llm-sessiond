import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { SessionCore } from '../src/core.ts';
import { nativeFixture, NativePort } from './native-support.ts';
import { rejectsCode } from './fake-port.ts';

for (const shared of ['state', 'native'] as const) {
  test(`native ownership gate: second daemon sharing ${shared} root fails before effects and never removes owner's lock`, async t => {
    const { root, options, core } = nativeFixture(t);
    const stateLock = join(options.stateDir, '.llm-sessiond.lock');
    const nativeLock = join(options.nativeSessionDir, '.llm-sessiond.lock');
    const before = [readFileSync(stateLock, 'utf8'), readFileSync(nativeLock, 'utf8')];
    const other = { ...options, ...(shared === 'native' ? { stateDir: join(root, 'other-state') } : {}) };
    const port = new NativePort();
    assert.throws(() => new SessionCore(port, other), { code: 'storage-failed' });
    assert.equal(port.starts, 0);
    assert.deepEqual([readFileSync(stateLock, 'utf8'), readFileSync(nativeLock, 'utf8')], before);
    if (shared === 'native') assert.equal(existsSync(join(other.stateDir, '.llm-sessiond.lock')), false);
    await core.shutdown();
    const next = new SessionCore(port, other);
    assert.deepEqual(next.list(), []);
    await next.shutdown();
  });
}

test('native ownership gate: same canonical root is acquired once and released after clean shutdown', async t => {
  const { options, core } = nativeFixture(t);
  await core.shutdown();
  const shared = { ...options, nativeSessionDir: options.stateDir };
  const next = new SessionCore(new NativePort(), shared);
  next.create('s'); await next.stop('s');
  await next.shutdown();
  assert.equal(existsSync(join(shared.stateDir, '.llm-sessiond.lock')), false);
});

test('native ownership gate: corrupt metadata load rolls back only newly acquired locks', async t => {
  const { options, core } = nativeFixture(t);
  await core.shutdown();
  writeFileSync(join(options.stateDir, 'corrupt.json'), '{broken');
  assert.throws(() => new SessionCore(new NativePort(), options), { code: 'storage-failed' });
  assert.equal(existsSync(join(options.stateDir, '.llm-sessiond.lock')), false);
  assert.equal(existsSync(join(options.nativeSessionDir, '.llm-sessiond.lock')), false);
  assert.equal(readFileSync(join(options.stateDir, 'corrupt.json'), 'utf8'), '{broken');
});

test('native ownership gate: leftover crash lock fails closed without stale takeover', async t => {
  const { options, core } = nativeFixture(t);
  await core.shutdown();
  const file = join(options.nativeSessionDir, '.llm-sessiond.lock');
  writeFileSync(file, 'operator-recovery-required', { flag: 'wx', mode: 0o600 });
  assert.throws(() => new SessionCore(new NativePort(), options), { code: 'storage-failed' });
  assert.equal(readFileSync(file, 'utf8'), 'operator-recovery-required');
  assert.equal(existsSync(join(options.stateDir, '.llm-sessiond.lock')), false);
});

test('native ownership gate: uncertain owned cleanup does not release native ownership', async t => {
  const { options, core, port } = nativeFixture(t);
  core.create('s'); await core.start('s');
  port.stop = async () => ({ kind: 'unknown' });
  await rejectsCode(core.stop('s'), 'harness-unknown');
  assert.deepEqual((await core.shutdown()).uncertainSessionIds, ['s']);
  assert.equal(existsSync(join(options.nativeSessionDir, '.llm-sessiond.lock')), true);
  assert.throws(() => new SessionCore(new NativePort(), options), { code: 'storage-failed' });
});
