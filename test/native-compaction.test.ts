import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { SessionCore } from '../src/core.ts';
import { createPiHarness } from '../src/pi-harness.ts';
import { nativeFixture } from './native-support.ts';
import { until } from './pi-observation.ts';

for (const scenario of ['success', 'empty', 'small', 'refused'] as const) {
  test(`native-compaction: fake native ${scenario}, standard history and exact reopen without replay`, async t => {
    const f = nativeFixture(t); await f.core.shutdown();
    const harness = createPiHarness({ executable: process.execPath, cwd: f.root,
      prefixArgs: [fileURLToPath(new URL('./native-history-child.ts', import.meta.url)), f.root,
        scenario === 'refused' ? 'compact-refused' : 'normal'] });
    const options = { ...f.options, cwd: f.root };
    let core = new SessionCore(harness, options);
    const text: string[] = [];
    core.subscribe(event => { if (event.type === 'text') text.push(event.text); });
    const send = async (id: string, message: string) => {
      await core.send('s', id, message);
      await until(() => core.get('s').input?.status === 'completed', `completed ${id}`);
    };
    try {
      core.create('s'); await core.start('s');
      const marker = 'native-compaction-owned-facts';
      if (scenario !== 'empty') await send('remember', marker);
      if (scenario === 'success' || scenario === 'refused') await send('other', 'some more context');
      const before = await core.settings('s');
      const result = await core.compact('s', 'Keep facts');
      assert.deepEqual(result, scenario === 'success' ? { kind: 'confirmed', value: undefined } : { kind: 'unknown' });
      assert.equal(text.includes(marker), false); // Summary is private, not a text observation.
      const file = join(f.options.nativeSessionDir, readdirSync(f.options.nativeSessionDir).find(name => name.endsWith('.jsonl'))!);
      const history = () => readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line));
      const nativeId = history()[0].id;
      assert.equal(history().filter(entry => entry.type === 'compaction').length, scenario === 'success' ? 1 : 0);
      if (scenario === 'success') {
        assert.equal(history().find(entry => entry.type === 'compaction').summary, marker);
        assert.deepEqual(await core.settings('s'), before);
        await send('after-compact', 'recall'); assert.equal(text.at(-1), marker);
      } else {
        assert.equal(core.get('s').status, 'unknown');
        await assert.rejects(core.send('s', 'blocked', 'must not reach native'));
      }
      await core.stop('s'); await core.shutdown();
      // New Core/registry/owned subprocess reads the same native compaction, not a replay in the daemon.
      core = new SessionCore(createPiHarness({ executable: process.execPath, cwd: f.root,
        prefixArgs: [fileURLToPath(new URL('./native-history-child.ts', import.meta.url)), f.root] }), options);
      core.subscribe(event => { if (event.type === 'text') text.push(event.text); });
      assert.equal(core.get('s').status, 'stopped');
      await core.start('s'); assert.equal(history()[0].id, nativeId);
      assert.deepEqual(await core.settings('s'), before);
      await send('after-reopen', 'recall'); assert.equal(text.at(-1), scenario === 'empty' ? 'no-context' : marker);
      await core.stop('s');
      const traces = readdirSync(f.root).filter(name => name.endsWith('.controls'));
      assert.equal(traces.length, 2);
      const controls = traces.flatMap(name => readFileSync(join(f.root, name), 'utf8').trim().split('\n'));
      assert.equal(controls.filter(type => type === 'compact').length, 1);
      assert.equal(controls.includes('abort'), false);
      const compactFrames = readdirSync(f.root).filter(name => name.endsWith('.compactions'))
        .flatMap(name => readFileSync(join(f.root, name), 'utf8').trim().split('\n').map(line => JSON.parse(line)));
      assert.equal(compactFrames.length, 1); assert.equal(compactFrames[0].customInstructions, 'Keep facts');
    } finally { await core.shutdown(); }
    for (const name of readdirSync(f.root).filter(name => name.endsWith('.health'))) assert.equal(readFileSync(join(f.root, name), 'utf8'), 'healthy');
  });
}
