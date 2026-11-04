// Executed only by evidence regressions: the child test MUST fail in its after hook.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SessionCore } from '../src/core.ts';
import { final, fixture } from './pi-support.ts';

const [fault, disposition] = process.argv.slice(2);
test(`fixture evidence probe ${fault}/${disposition}`, async t => {
  const flags = fault === 'prompt' ? ['--ignore-prompt'] : ['--wrong-ready'];
  const f = await fixture(t, ['fence', 'parallel'].includes(fault) ? [] : flags,
    fault === 'prompt' ? 300 : undefined, 50);
  const core = new SessionCore(f.port);
  core.create('s');
  if (fault === 'start') {
    await assert.rejects(core.start('s'), { code: 'harness-unknown' });
  } else {
    await core.start('s');
    if (fault === 'parallel') {
      core.create('other');
      await core.start('other');
    }
    const other = fault === 'parallel'
      ? core.send('other', 'good', JSON.stringify({ records: final() })) : undefined;
    const result = await core.send('s', 'i', JSON.stringify({
      disposition, omitFence: ['fence', 'parallel'].includes(fault), records: final(),
    }));
    assert.deepEqual(result, { inputId: 'i', status: 'unknown' });
    if (other) {
      assert.deepEqual(await other, { inputId: 'good', status: 'completed' });
      await core.stop('other');
    }
    assert.equal((await core.stop('s')).status, 'stopped');
  }
  console.log('probe body accepted isolated unknown');
});
