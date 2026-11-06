import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { SessionCore } from '../src/core.ts';
import { nativeFixture, nativeHeader, NativePort } from './native-support.ts';
import { invalidPayloads, validPayloads, validUser } from './native-context-cases.ts';

const timestamp = '2024-01-02T03:04:05.000Z';
function history(nativeId: ReturnType<typeof randomUUID>, version: number, payload?: Record<string, unknown>) {
  const header = { ...JSON.parse(nativeHeader(nativeId)), version };
  const base = { type: 'message', id: 'base', parentId: null, timestamp, message: validUser };
  const entries = [header, base];
  if (payload) entries.push({ id: 'payload', parentId: 'base', timestamp, ...payload });
  return entries.map(entry => JSON.stringify(entry)).join('\n') + '\n';
}

for (const version of [2, 3]) {
  for (const [name, payload] of validPayloads) {
    test(`native context v${version}: import and reopen preserve ${name}`, async t => {
      const { core, options } = nativeFixture(t);
      const nativeId = randomUUID(), file = join(options.nativeSessionDir, 'context.jsonl');
      const bytes = history(nativeId, version, payload); writeFileSync(file, bytes);
      assert.deepEqual(core.catalogue(), [{ nativeId }]); core.register('s', nativeId);
      await core.start('s'); await core.stop('s'); await core.shutdown();
      const restored = new SessionCore(new NativePort(), options);
      try { assert.equal((await restored.start('s')).status, 'running'); }
      finally { await restored.shutdown(); }
      assert.equal(readFileSync(file, 'utf8'), bytes);
    });
  }
  for (const [name, payload] of invalidPayloads) {
    for (const operation of ['import', 'reopen']) {
      test(`native context v${version}: ${operation} rejects ${name} before launch without rewriting`, async t => {
        const { core, port, options } = nativeFixture(t);
        const nativeId = randomUUID(), file = join(options.nativeSessionDir, 'context.jsonl');
        const bad = history(nativeId, version, payload);
        if (operation === 'import') {
          writeFileSync(file, bad);
          assert.deepEqual(core.catalogue(), []);
          assert.throws(() => core.register('s', nativeId), { code: 'native-invalid' });
          assert.equal(port.starts, 0);
        } else {
          writeFileSync(file, history(nativeId, version)); core.register('s', nativeId);
          await core.start('s'); await core.stop('s'); await core.shutdown();
          writeFileSync(file, bad);
          const restoredPort = new NativePort(), restored = new SessionCore(restoredPort, options);
          await assert.rejects(restored.start('s'), { code: 'native-invalid' });
          assert.equal(restoredPort.starts, 0);
          await restored.shutdown();
        }
        assert.equal(readFileSync(file, 'utf8'), bad);
      });
    }
  }
}
