import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boundary, final, fixture } from './pi-support.ts';

test('pi fixture tolerates delayed readiness before exercising a real prompt', async t => {
  const f = await fixture(t, ['--ready-delay=450']);
  assert.equal((await f.start()).kind, 'confirmed');
  assert.equal((await f.send({ records: final() })).kind, 'confirmed');
  assert.deepEqual(f.events, [{ type: 'input-completed', inputId: 'i' }]);
  assert.ok(f.phases().includes('prompt'));
});

test('pi fixture observes delayed records beyond the former polling budget', async t => {
  const f = await fixture(t);
  await f.start();
  await f.send({ later: final(), laterDelay: 650 });
  assert.deepEqual(f.events, []);
  await f.until(() => f.events.length === 1, 'delayed final records');
  assert.deepEqual(f.events, [{ type: 'input-completed', inputId: 'i' }]);
});

for (const flag of ['--no-ready', '--wrong-ready', '--malformed-ready', '--ready-delay=450']) {
  test(`pi fixture rejects failed readiness and observes cleanup: ${flag}`, async t => {
    const deliberateTimeout = flag === '--no-ready' || flag === '--ready-delay=450';
    const f = await fixture(t, [flag], deliberateTimeout ? 300 : undefined);
    await assert.rejects(f.start(), /readiness phase; outcomes=start:unknown/);
    await f.phase('get_state');
    await assert.rejects(f.send({ records: final() }), /requires confirmed readiness/);
    assert.ok(!f.phases().includes('prompt'));
    assert.equal((await f.port.stop('s')).kind, 'confirmed');
  });
}

for (const loss of [{ invalidUtf8: true }, { raw: 'not json\n' }, { eof: true }, { exit: true }]) {
  test(`pi fixture gates active loss after consumed batched ACK/boundary: ${JSON.stringify(loss)}`, async t => {
    const f = await fixture(t);
    await f.start();
    assert.equal((await f.send({ batch: true, records: [boundary], ...loss })).kind, 'confirmed');
    await f.until(() => f.events.length === 1, 'gated loss terminal');
    assert.deepEqual(f.events, [{ type: 'input-failed', inputId: 'i', certainty: 'unknown' }]);
  });
}

test('pi fixture diagnoses a missing observation without protocol payloads', async t => {
  const f = await fixture(t);
  await f.start();
  await assert.rejects(f.until(() => false, 'deliberate missing phase', 20),
    /deliberate missing phase: exceeded 20ms; outcomes=start:confirmed; phases=/);
});
