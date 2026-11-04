import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { SessionCore } from '../src/core.ts';
import { fixtureHealth } from './pi-fixture-health.ts';
import type { HarnessPort } from '../src/contracts.ts';
import { final, fixture } from './pi-support.ts';

for (const disposition of ['handled', 'queued']) {
  for (const fault of ['prompt', 'fence', 'parallel', 'start']) {
    test(`pi evidence health fails OUTSIDE Core: ${fault}/${disposition}`, async t => {
      const { NODE_TEST_CONTEXT: _context, ...env } = process.env;
      try {
        await promisify(execFile)(process.execPath, ['--experimental-strip-types',
          fileURLToPath(new URL('./pi-health-probe.ts', import.meta.url)), fault, disposition],
        { timeout: 15_000, env });
        assert.fail('an unhealthy child test must not pass');
      } catch (error) {
        const result = error as Error & { code: number; stdout: string };
        assert.equal(result.code, 1);
        assert.match(result.stdout, /probe body accepted isolated unknown/);
        assert.match(result.stdout, /owned host cleanup confirmed/);
        assert.match(result.stdout, /fixture health failure/);
        t.diagnostic(result.stdout);
      }
    });
  }
}

for (const operation of ['start', 'send', 'stop'] as const) {
  test(`pi health latches swallowed Core ${operation} prerequisite errors`, async () => {
    const health = fixtureHealth();
    const fail = async (phase: string) => {
      assert.notEqual(phase, operation, 'deliberate prerequisite failure');
      return { kind: 'confirmed' as const };
    };
    const port: HarnessPort = {
      start: () => fail('start'), send: () => fail('send'), stop: () => fail('stop'),
    };
    const core = new SessionCore(health.wrap(port));
    core.create('s');
    if (operation === 'start') await assert.rejects(core.start('s'), { code: 'harness-unknown' });
    else {
      await core.start('s');
      if (operation === 'send') {
        assert.deepEqual(await core.send('s', 'i', 'unused'), { inputId: 'i', status: 'unknown' });
      } else await assert.rejects(core.stop('s'), { code: 'harness-unknown' });
    }
    assert.throws(health.assertHealthy, /fixture health failure/);
  });
}

test('pi per-input fences and later gates remain independent across parallel sessions', async t => {
  const f = await fixture(t);
  await Promise.all([f.start('a'), f.start('b')]);
  const a = f.gate();
  const b = f.gate();
  assert.notEqual(a.id, b.id);
  await Promise.all([
    f.send({ later: final(), laterGate: a.id }, 'A', 'a'),
    f.send({ later: final(), laterGate: b.id }, 'B', 'b'),
  ]);
  assert.deepEqual(f.events, []);
  b.release();
  await f.until(() => f.events.length === 1, 'B only');
  assert.deepEqual(f.events, [{ type: 'input-completed', inputId: 'B' }]);
  assert.equal(a.written(), false);
  a.release();
  await f.until(() => f.events.length === 2, 'A after B');
  assert.deepEqual(f.events, [
    { type: 'input-completed', inputId: 'B' }, { type: 'input-completed', inputId: 'A' },
  ]);
  f.assertHealthy();
});
