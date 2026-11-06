import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { SessionCore } from '../src/core.ts';
import type { PortOutcome } from '../src/types.ts';
import { createPiHarness } from '../src/pi-harness.ts';
import { metadataPath, nativeFixture } from './native-support.ts';
import { rejectsCode } from './fake-port.ts';

test('native readiness: attempted unknown empty history is never initialized twice after proven stop', async t => {
  const { core, port, options } = nativeFixture(t);
  core.create('s');
  const file = join(options.nativeSessionDir, readdirSync(options.nativeSessionDir).find(name => name.endsWith('.jsonl'))!);
  port.start = async (): Promise<PortOutcome> => { port.starts++; return { kind: 'unknown' }; };
  await rejectsCode(core.start('s'), 'harness-unknown');
  assert.equal(readFileSync(file, 'utf8'), '');
  assert.equal((await core.stop('s')).status, 'stopped');
  await rejectsCode(core.start('s'), 'native-invalid');
  assert.equal(port.starts, 1);
  assert.equal(readFileSync(file, 'utf8'), '');
  await core.shutdown();
  const restored = new SessionCore(port, options);
  await rejectsCode(restored.start('s'), 'native-invalid');
  assert.equal(port.starts, 1);
});

for (const mode of ['wrong-id', 'wrong-path', 'wrong-cwd']) {
  test(`native readiness: correlated state and actual header/cwd/exact path must agree (${mode})`, async t => {
    const { root, options, core: fixtureCore } = nativeFixture(t);
    await fixtureCore.shutdown();
    const harness = createPiHarness({ executable: process.execPath, cwd: root,
      prefixArgs: [fileURLToPath(new URL('./native-history-child.ts', import.meta.url)), root, mode] });
    const core = new SessionCore(harness, { ...options, cwd: root });
    const statuses: string[] = [];
    core.subscribe(event => { if (event.type === 'session') statuses.push(event.session.status); });
    core.create('s');
    const file = join(options.nativeSessionDir, readdirSync(options.nativeSessionDir).find(name => name.endsWith('.jsonl'))!);
    try {
      await rejectsCode(core.start('s'), 'harness-unknown');
      assert.equal(core.get('s').status, 'unknown');
      assert.equal(statuses.includes('running'), false);
      assert.equal(JSON.parse(readFileSync(metadataPath(options.stateDir), 'utf8')).native.fresh, false);
      assert.equal((await core.stop('s')).status, 'stopped');
      writeFileSync(file, '');
      await rejectsCode(core.start('s'), 'native-invalid');
      const health = readdirSync(root).filter(name => name.endsWith('.health'));
      assert.equal(health.length, 1);
      assert.equal(readFileSync(join(root, health[0]), 'utf8'), 'healthy');
    } finally { await core.shutdown(); }
  });
}
