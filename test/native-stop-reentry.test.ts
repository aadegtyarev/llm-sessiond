import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { blockWrites, metadataPath, nativeFixture } from './native-support.ts';
import { rejectsCode } from './fake-port.ts';

for (const phase of ['input-unknown', 'session-stopped', 'created', 'cached-proof'] as const) {
  test(`managed stop admission spans all publications and the command result (${phase})`, async t => {
    const { core, port, options } = nativeFixture(t);
    core.create('s');
    if (phase !== 'created') { await core.start('s'); await core.send('s', 'old', 'data'); }
    if (phase === 'cached-proof') {
      const unblock = blockWrites(options.stateDir);
      await rejectsCode(core.stop('s'), 'storage-failed'); unblock();
    }
    const starts = port.starts;
    let nested: Promise<unknown> | undefined;
    let deleteCode: unknown;
    core.subscribe(event => {
      const selected = phase === 'input-unknown'
        ? event.type === 'input' && event.input.status === 'unknown'
        : event.type === 'session' && event.session.status === 'stopped';
      if (!selected || nested) return;
      nested = core.start('s').then(view => view, error => error.code);
      try { core.delete('s'); } catch (error) { deleteCode = (error as { code: string }).code; }
    });
    assert.equal((await core.stop('s')).status, 'stopped');
    assert.ok(nested);
    assert.equal(await nested, 'invalid-state');
    assert.equal(deleteCode, 'invalid-state');
    assert.equal(port.starts, starts);
    assert.equal(JSON.parse(readFileSync(metadataPath(options.stateDir), 'utf8')).status, 'stopped');
    assert.equal(core.get('s').status, 'stopped');
    assert.equal((await core.start('s')).status, 'running');
    await core.stop('s');
  });
}
