// Executed only by evidence regressions: the child test MUST fail in its after hook.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { performance } from 'node:perf_hooks';
import { SessionCore } from '../src/core.ts';
import { final, fixture } from './pi-support.ts';

const [fault, disposition] = process.argv.slice(2);
test(`fixture evidence probe ${fault}/${disposition}`, async t => {
  const flags = fault === 'prompt' ? ['--ignore-prompt'] : ['--wrong-ready'];
  const f = await fixture(t, ['fence', 'parallel'].includes(fault) ? [] : flags,
    fault === 'prompt' ? 300 : undefined,
    { sessionId: 's', inputId: 'i', observationMs: 50 });
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
    const healthyGate = f.gate();
    let healthySettled = false;
    const other = fault === 'parallel'
      ? core.send('other', 'good', JSON.stringify({ records: final(), fenceGate: healthyGate.id }))
        .then(result => { healthySettled = true; return result; }) : undefined;
    if (other) await f.phase(`fence-held:${healthyGate.id}`);
    const heldAt = performance.now();
    const result = await core.send('s', 'i', JSON.stringify({
      disposition, omitFence: ['fence', 'parallel'].includes(fault), records: final(),
    }));
    assert.deepEqual(result, { inputId: 'i', status: 'unknown' });
    if (other) {
      assert.equal(healthySettled, false);
      const elapsed = performance.now() - heldAt;
      assert.ok(elapsed >= 50, 'healthy observation must outlast the short fault budget');
      healthyGate.release();
      assert.deepEqual(await other, { inputId: 'good', status: 'completed' });
      console.log(`healthy actor observed after fault budget: ${elapsed.toFixed(1)}ms`);
      await core.stop('other');
    }
    assert.equal((await core.stop('s')).status, 'stopped');
  }
  console.log('probe body accepted isolated unknown');
});
