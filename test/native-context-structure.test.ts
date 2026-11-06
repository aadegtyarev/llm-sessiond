import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { test, type TestContext } from 'node:test';
import { SessionCore } from '../src/core.ts';
import { nativeFixture, nativeHeader, NativePort } from './native-support.ts';
import { validUser } from './native-context-cases.ts';

type Version = 1 | 2 | 3 | undefined;
type Entry = Record<string, unknown>;
const timestamp = '2024-01-02T03:04:05.000Z';
const user = (id: string, parentId: string | null): Entry => ({ type: 'message', id, parentId, timestamp, message: validUser });
const compact = (parentId: string | null, retention: Entry): Entry => ({
  type: 'compaction', id: 'compact', parentId, timestamp, summary: 'retained summary', tokensBefore: 1, ...retention,
});

function history(id: ReturnType<typeof randomUUID>, version: Version, entries: readonly Entry[]): string {
  const header = { ...JSON.parse(nativeHeader(id)), version };
  const records = entries.map(entry => {
    if (version !== undefined && version > 1) return entry;
    const { id: _id, parentId: _parentId, ...linear } = entry;
    return linear; // Native v1 records have no IDs until sequential Pi migration.
  });
  return [header, ...records].map(entry => JSON.stringify(entry)).join('\n') + '\n';
}

async function admission(t: TestContext, version: Version, entries: readonly Entry[], valid: boolean, operation: 'import' | 'reopen') {
  const fixture = nativeFixture(t), id = randomUUID(), file = join(fixture.options.nativeSessionDir, 'structure.jsonl');
  let core = fixture.core, port = fixture.port;
  const bytes = history(id, version, entries);
  try {
    if (operation === 'reopen') {
      writeFileSync(file, history(id, version, [user('root', null)]));
      core.register('s', id); await core.start('s'); await core.stop('s'); await core.shutdown();
      port = new NativePort(); core = new SessionCore(port, fixture.options);
    }
    writeFileSync(file, bytes);
    if (valid) {
      assert.deepEqual(core.catalogue(), [{ nativeId: id }]);
      if (operation === 'import') core.register('s', id);
      assert.equal((await core.start('s')).status, 'running');
    } else {
      assert.deepEqual(core.catalogue(), []);
      if (operation === 'import') assert.throws(() => core.register('s', id), { code: 'native-invalid' });
      else await assert.rejects(core.start('s'), { code: 'native-invalid' });
      assert.equal(port.starts, 0);
    }
    assert.equal(readFileSync(file, 'utf8'), bytes);
    assert.equal(port.healthy, true);
  } finally { await core.shutdown(); }
}

for (const version of [undefined, 1, 2, 3] as const) {
  for (const operation of ['import', 'reopen'] as const) {
    test(`native retention v${version ?? 'absent'}: ${operation} accepts first-record self retain-none`, async t => {
      const retention = version === undefined || version === 1 ? { firstKeptEntryIndex: 1 } : { firstKeptEntryId: 'compact' };
      await admission(t, version, [compact(null, retention)], true, operation);
    });
  }
}

// Pi migrateV1ToV2 assigns the current ID before resolving an index that includes the header.
for (const version of [undefined, 1] as const) {
  for (const retention of [1, 2, 3, 4]) {
    for (const operation of ['import', 'reopen'] as const) {
      test(`native retention v${version ?? 'absent'}: ${operation} ${retention <= 2 ? 'accepts' : 'rejects future'} index${retention} at compaction file index2`, async t => {
        await admission(t, version, [user('root', null), compact('root', { firstKeptEntryIndex: retention }),
          user('later', 'compact'), user('last', 'later')], retention <= 2, operation);
      });
    }
  }
}

// Native retention may refer to self (retain-none) or the actual parent chain, never a sibling/root elsewhere.
for (const version of [2, 3] as const) {
  for (const target of ['root', 'middle', 'leaf', 'compact', 'sibling', 'other-root']) {
    for (const operation of ['import', 'reopen'] as const) {
      const valid = target !== 'sibling' && target !== 'other-root';
      test(`native retention v${version}: ${operation} ${valid ? 'accepts ancestor/self' : 'rejects other branch'} ${target}`, async t => {
        await admission(t, version, [user('root', null), user('other-root', null), user('sibling', 'root'),
          user('middle', 'root'), user('leaf', 'middle'), compact('leaf', { firstKeptEntryId: target }),
          user('tail', 'compact')], valid, operation);
      });
    }
  }
}

// Pi-ai Tool requires description/parameters; ToolReference in toolsRemoved requires name only.
const toolSites: readonly { version: Version; checkpoint: boolean }[] = [
  { version: undefined, checkpoint: false }, { version: 1, checkpoint: false },
  { version: 2, checkpoint: false }, { version: 3, checkpoint: false },
  { version: 2, checkpoint: true }, { version: 3, checkpoint: true },
];
const badTools: readonly [string, Entry][] = [
  ['name-only declaration', { name: 'read' }],
  ['missing description', { name: 'read', parameters: {} }],
  ['null description', { name: 'read', description: null, parameters: {} }],
  ['numeric description', { name: 'read', description: 1, parameters: {} }],
  ['missing parameters', { name: 'read', description: 'read' }],
  ['null parameters', { name: 'read', description: 'read', parameters: null }],
  ['array parameters', { name: 'read', description: 'read', parameters: [] }],
  ['string parameters', { name: 'read', description: 'read', parameters: 'schema' }],
  ['boolean parameters', { name: 'read', description: 'read', parameters: true }],
  ['numeric parameters', { name: 'read', description: 'read', parameters: 1 }],
];
const goodTools: readonly [string, Entry][] = [
  ['full declaration and opaque metadata', { toolsAdded: [{ name: 'read', description: 'read',
    parameters: { type: 'object', properties: { path: { type: 'string' } }, 'x-native': { opaque: [1, null] } },
    vendorMetadata: { opaque: true } }], toolsRemoved: [{ name: 'old', vendorMetadata: { opaque: true } }] }],
  ['minimal declaration', { toolsAdded: [{ name: 'read', description: '', parameters: {} }], toolsRemoved: [{ name: 'old' }] }],
  ['removed-name reference only', { toolsRemoved: [{ name: 'old' }], vendorMetadata: { opaque: true } }],
];
function systemEntry(checkpoint: boolean, tools: Entry): Entry {
  const systemMessage = { role: 'system', content: '', timestamp: 1, ...tools };
  return checkpoint ? compact('root', { firstKeptEntryId: 'root', systemMessage })
    : { type: 'message', id: 'system', parentId: 'root', timestamp, message: systemMessage };
}
for (const { version, checkpoint } of toolSites) {
  for (const operation of ['import', 'reopen'] as const) {
    for (const [name, tool] of badTools) {
      test(`native tools v${version ?? 'absent'} ${checkpoint ? 'checkpoint' : 'message'}: ${operation} rejects ${name}`, async t => {
        await admission(t, version, [user('root', null), systemEntry(checkpoint, { toolsAdded: [tool] })], false, operation);
      });
    }
    for (const [name, tools] of goodTools) {
      test(`native tools v${version ?? 'absent'} ${checkpoint ? 'checkpoint' : 'message'}: ${operation} preserves ${name}`, async t => {
        await admission(t, version, [user('root', null), systemEntry(checkpoint, tools)], true, operation);
      });
    }
  }
}
