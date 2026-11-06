import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { SessionCore } from '../src/core.ts';
import { nativeFixture, nativeHeader, NativePort } from './native-support.ts';
import { message } from './pi-records.ts';

const timestamp = '2024-01-02T03:04:05.000Z';
// Pi migrateV1ToV2 accepts a linear stream with no id/parentId and a header with no version.
function legacy(nativeId: ReturnType<typeof randomUUID>) {
  const header = JSON.parse(nativeHeader(nativeId)); delete header.version;
  return [header,
    { type: 'message', timestamp, message: { role: 'user', content: 'legacy-context-marker', timestamp: 1 } },
    { type: 'message', timestamp, message: message('stop').message },
    { type: 'message', timestamp, message: { role: 'hookMessage', customType: 'fixture', content: 'retained', display: true, timestamp: 1 } },
    { type: 'compaction', timestamp, summary: 'legacy summary', firstKeptEntryIndex: 1, tokensBefore: 2 },
  ].map(entry => JSON.stringify(entry)).join('\n') + '\n';
}

test('native legacy: absent header version imports and reopens source-shaped linear context without daemon repair', async t => {
  const { core, options } = nativeFixture(t);
  const nativeId = randomUUID(), file = join(options.nativeSessionDir, 'legacy.jsonl'), bytes = legacy(nativeId);
  writeFileSync(file, bytes);
  assert.deepEqual(core.catalogue(), [{ nativeId }]); core.register('s', nativeId);
  await core.start('s'); await core.stop('s'); await core.shutdown();
  const restored = new SessionCore(new NativePort(), options);
  try { assert.equal((await restored.start('s')).status, 'running'); }
  finally { await restored.shutdown(); }
  assert.equal(readFileSync(file, 'utf8'), bytes);
});

for (const version of [1, 2]) {
  test(`native legacy: explicit v${version} retains historical hookMessage content`, async t => {
    const { core, options } = nativeFixture(t);
    const nativeId = randomUUID(), file = join(options.nativeSessionDir, 'legacy.jsonl');
    const entries = legacy(nativeId).trim().split('\n').map(line => JSON.parse(line));
    entries[0].version = version;
    if (version === 2) entries.slice(1).forEach((entry, index) => {
      entry.id = `entry${index}`; entry.parentId = index === 0 ? null : `entry${index - 1}`;
      if (entry.type === 'compaction') { entry.firstKeptEntryId = 'entry0'; delete entry.firstKeptEntryIndex; }
    });
    const bytes = entries.map(entry => JSON.stringify(entry)).join('\n') + '\n'; writeFileSync(file, bytes);
    core.register('s', nativeId); await core.start('s'); await core.stop('s');
    assert.equal(readFileSync(file, 'utf8'), bytes);
  });
}

for (const version of [undefined, 1]) {
  for (const defect of ['user-content', 'hook-content', 'missing-retention', 'out-of-range-retention', 'missing-summary']) {
    for (const operation of ['import', 'reopen']) {
      test(`native legacy ${version ?? 'absent'}: ${operation} rejects ${defect} without loss/reset`, async t => {
        const { core, port, options } = nativeFixture(t);
        const nativeId = randomUUID(), file = join(options.nativeSessionDir, 'legacy.jsonl');
        writeFileSync(file, legacy(nativeId));
        if (operation === 'reopen') { core.register('s', nativeId); await core.stop('s'); }
        const entries = legacy(nativeId).trim().split('\n').map(line => JSON.parse(line));
        entries[0].version = version;
        if (defect === 'user-content') delete entries[1].message.content;
        if (defect === 'hook-content') entries[3].message.content = null;
        if (defect === 'missing-retention') delete entries[4].firstKeptEntryIndex;
        if (defect === 'out-of-range-retention') entries[4].firstKeptEntryIndex = entries.length;
        if (defect === 'missing-summary') delete entries[4].summary;
        const bytes = entries.map(entry => JSON.stringify(entry)).join('\n') + '\n'; writeFileSync(file, bytes);
        if (operation === 'import') assert.throws(() => core.register('s', nativeId), { code: 'native-invalid' });
        else await assert.rejects(core.start('s'), { code: 'native-invalid' });
        assert.equal(port.starts, 0);
        assert.equal(readFileSync(file, 'utf8'), bytes);
      });
    }
  }
}

for (const version of [null, 0, 4, '1']) {
  for (const operation of ['import', 'reopen']) {
    test(`native legacy: ${operation} rejects explicit unsupported version ${JSON.stringify(version)}`, async t => {
      const { core, port, options } = nativeFixture(t);
      const nativeId = randomUUID(), file = join(options.nativeSessionDir, 'legacy.jsonl');
      writeFileSync(file, nativeHeader(nativeId));
      if (operation === 'reopen') { core.register('s', nativeId); await core.stop('s'); }
      const entries = legacy(nativeId).trim().split('\n').map(line => JSON.parse(line)); entries[0].version = version;
      const bytes = entries.map(entry => JSON.stringify(entry)).join('\n') + '\n'; writeFileSync(file, bytes);
      if (operation === 'import') assert.throws(() => core.register('s', nativeId), { code: 'native-invalid' });
      else await assert.rejects(core.start('s'), { code: 'native-invalid' });
      assert.equal(port.starts, 0);
      assert.equal(readFileSync(file, 'utf8'), bytes);
    });
  }
}
