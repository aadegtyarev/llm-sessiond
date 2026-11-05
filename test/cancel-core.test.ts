import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { SessionCore, type CoreEvent, type PortOutcome } from '../src/core.ts';
import { FakePort, deferred, rejectsCode } from './fake-port.ts';
import { fixtureHealth } from './pi-fixture-health.ts';

async function setup(t: TestContext) {
  const raw = new FakePort();
  const control = deferred<PortOutcome>();
  const calls: string[][] = [];
  const health = fixtureHealth();
  const port = Object.assign(raw, { cancel: async (...args: [string, string]) => {
    calls.push(args); return control.promise;
  } });
  const core = new SessionCore(health.wrap(port));
  t.after(() => health.assertHealthy());
  const events: CoreEvent[] = [];
  core.subscribe(e => events.push(e));
  for (const id of ['s', 'other']) { core.create(id); await core.start(id); }
  await core.send('s', 'A', 'text');
  return { raw, core, control, calls, events };
}

for (const terminal of ['input-completed', 'input-cancelled'] as const) {
  test(`cancel Core: ${terminal} wins late control; A cannot mutate B`, async t => {
    const f = await setup(t);
    const cancel = f.core.cancel('s', 'A');
    await rejectsCode(f.core.cancel('s', 'A'), 'invalid-state');
    f.raw.emit('s', { type: terminal, inputId: 'A' });
    await rejectsCode(f.core.send('s', 'B', ''), 'input-in-flight');
    f.control.resolve({ kind: 'unknown' });
    assert.equal((await cancel).status, terminal === 'input-completed' ? 'completed' : 'cancelled');
    await f.core.send('s', 'B', '');
    f.raw.emit('s', { type: 'input-cancelled', inputId: 'A' });
    assert.equal(f.core.get('s').input?.inputId, 'B');
    assert.equal(f.core.get('s').input?.status, 'pending');
    assert.deepEqual(f.calls, [['s', 'A']]);
  });
}

test('cancel Core: exact target/admission and unsolicited cancelled', async t => {
  const f = await setup(t);
  await rejectsCode(f.core.cancel('missing', 'A'), 'session-not-found');
  for (const [session, input] of [['s', 'wrong'], ['other', 'A']]) {
    await rejectsCode(f.core.cancel(session!, input!), 'invalid-state');
  }
  f.raw.emit('s', { type: 'input-cancelled', inputId: 'A' });
  assert.equal(f.core.get('s').input?.status, 'pending');
  assert.deepEqual(f.calls, []);
  const cancel = f.core.cancel('s', 'A');
  f.control.resolve({ kind: 'confirmed' });
  assert.equal((await cancel).status, 'pending');
  await rejectsCode(f.core.send('s', 'B', ''), 'input-in-flight');
  f.raw.emit('s', { type: 'input-cancelled', inputId: 'A' });
  assert.equal(f.core.get('s').input?.status, 'cancelled');
});

for (const cleanup of ['stop', 'shutdown'] as const) {
  test(`cancel Core: ${cleanup} invalidates late cancellation`, async t => {
    const f = await setup(t);
    const cancel = f.core.cancel('s', 'A');
    if (cleanup === 'stop') await f.core.stop('s'); else await f.core.shutdown();
    f.raw.emit('s', { type: 'input-cancelled', inputId: 'A' });
    f.control.resolve({ kind: 'confirmed' });
    assert.equal((await cancel).status, 'unknown');
    if (cleanup === 'stop') {
      assert.equal(f.core.get('s').status, 'stopped');
      await rejectsCode(f.core.cancel('s', 'A'), 'invalid-state');
    } else await rejectsCode(f.core.cancel('s', 'A'), 'closed');
  });
}
