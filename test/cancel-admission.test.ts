import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SessionCore, type HarnessPort, type PortOutcome } from '../src/core.ts';
import { FakePort, deferred, rejectsCode } from './fake-port.ts';
import { fixtureHealth } from './pi-fixture-health.ts';

for (const mode of ['unsupported', 'rejected', 'unknown', 'throws'] as const) {
  test(`cancel admission: ${mode} is not cancelled`, async () => {
    const raw = new FakePort();
    const health = fixtureHealth();
    const port: HarnessPort = mode === 'unsupported' ? raw : Object.assign(raw, {
      cancel: async (): Promise<PortOutcome> => {
        if (mode === 'throws') throw new Error('private fault');
        return { kind: mode };
      },
    });
    const core = new SessionCore(health.wrap(port));
    core.create('s'); await core.start('s'); await core.send('s', 'A', '');
    if (mode === 'unsupported' || mode === 'rejected') {
      await rejectsCode(core.cancel('s', 'A'), 'harness-rejected');
      assert.equal(core.get('s').input?.status, 'pending');
    } else assert.equal((await core.cancel('s', 'A')).status, 'unknown');
    await rejectsCode(core.send('s', 'B', ''), 'input-in-flight');
    if (mode === 'throws') assert.throws(health.assertHealthy, /cancel: fixture operation threw/);
    else health.assertHealthy();
  });
}

test('cancel admission: pending send ACK and unknown send never dispatch abort', async () => {
  const raw = new FakePort();
  const send = deferred<PortOutcome>();
  raw.sendOperation = () => send.promise;
  let calls = 0;
  const port = Object.assign(raw, { cancel: async (): Promise<PortOutcome> => {
    calls++; return { kind: 'confirmed' };
  } });
  const health = fixtureHealth();
  const core = new SessionCore(health.wrap(port));
  core.create('s'); await core.start('s');
  const sending = core.send('s', 'A', '');
  await rejectsCode(core.cancel('s', 'A'), 'invalid-state');
  send.resolve({ kind: 'unknown' }); await sending;
  await rejectsCode(core.cancel('s', 'A'), 'invalid-state');
  assert.equal(calls, 0);
  health.assertHealthy();
});
