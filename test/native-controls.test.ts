import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { SessionCore } from '../src/core.ts';
import { createPiHarness } from '../src/pi-harness.ts';
import { nativeFixture } from './native-support.ts';
import { until } from './pi-observation.ts';

for (const mode of ['helper-missing', 'helper-error']) {
  test(`native-controls: owned fake ${mode}, no LLM fallthrough, honest cleanup/reopen`, async t => {
    const f = nativeFixture(t); await f.core.shutdown();
    const harness = createPiHarness({ executable: process.execPath, cwd: f.root,
      prefixArgs: [fileURLToPath(new URL('./native-history-child.ts', import.meta.url)), f.root, mode] });
    const core = new SessionCore(harness, { ...f.options, cwd: f.root });
    try {
      core.create('s'); await core.start('s');
      assert.equal((await core.settings('s')).kind, 'confirmed');
      assert.deepEqual(await core.reload('s'), { kind: mode === 'helper-missing' ? 'rejected' : 'unknown' });
      const traces = readdirSync(f.root).filter(name => name.endsWith('.controls'));
      assert.equal(traces.length, 1);
      const trace = readFileSync(join(f.root, traces[0]), 'utf8').trim().split('\n');
      assert.equal(trace.filter(phase => phase === 'reload').length, mode === 'helper-missing' ? 0 : 1);
      assert.equal(trace.includes('user-prompt'), false);
      if (mode === 'helper-error') {
        assert.equal(core.get('s').status, 'unknown');
        await assert.rejects(core.send('s', 'blocked', 'must not write'));
        await core.stop('s'); await core.start('s');
      }
      await core.send('s', 'ordinary', 'remember');
      await until(() => core.get('s').input?.status === 'completed', 'ordinary send after helper failure/recovery');
      assert.equal((await core.stop('s')).status, 'stopped');
    } finally { await core.shutdown(); }
    for (const name of readdirSync(f.root).filter(name => name.endsWith('.health'))) assert.equal(readFileSync(join(f.root, name), 'utf8'), 'healthy');
  });
}
