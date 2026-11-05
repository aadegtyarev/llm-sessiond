import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SessionCore } from '../src/core.ts';
import { boundary, message, settled, final, fixture } from './pi-support.ts';

for (const reason of ['aborted', 'toolUse', 'stop', 'error', 'length']) {
  test(`pi cancel: owned ${reason} settlement and drained abort allow same child continue`, async t => {
    const f = await fixture(t);
    const core = new SessionCore(f.port);
    core.create('s'); await core.start('s');
    const gate = f.gate();
    await core.send('s', 'A', JSON.stringify({ records: [boundary, message('toolUse')],
      abort: { records: [message(reason), settled(true)], gate: gate.id } }));
    const cancel = core.cancel('s', 'A');
    await f.phase('abort-received');
    assert.equal(core.get('s').input?.status, 'pending');
    await assert.rejects(core.send('s', 'B', ''), /input-in-flight/);
    gate.release();
    assert.equal((await cancel).status, 'cancelled');
    await core.send('s', 'B', JSON.stringify({ records: final() }));
    assert.equal(core.get('s').input?.status, 'completed');
    assert.equal(f.phases().filter(p => p === 'get_state').length, 1);
    assert.equal(f.phases().filter(p => p === 'abort-received').length, 1);
    f.assertHealthy();
  });
}

for (const [name, records] of [
  ['incomplete', [message('toolUse'), { type: 'agent_end' }]],
  ['conflicting', [message('toolUse'), settled(false)]],
  ['bad-control', [message('aborted'), settled('true')]],
] as const) {
  test(`pi cancel: ${name} cannot release next input`, async t => {
    const f = await fixture(t);
    await f.start();
    await f.send({ records: [boundary], abort: { records } });
    await f.port.cancel!('s', 'i');
    await f.phase('abort-received');
    assert.deepEqual(f.events, [{ type: 'input-failed', inputId: 'i', certainty: 'unknown' }]);
    assert.equal((await f.send({ records: final() }, 'B')).kind, 'unknown');
    assert.equal(f.phases().filter(p => p === 'prompt').length, 1);
    f.assertHealthy();
  });
}

for (const cleanup of ['stop', 'shutdown'] as const) {
  test(`pi cancel: ${cleanup} during abort drains no false cancelled`, async t => {
    const f = await fixture(t);
    const core = new SessionCore(f.port);
    const statuses: string[] = [];
    core.subscribe(e => { if (e.type === 'input') statuses.push(e.input.status); });
    core.create('s'); await core.start('s');
    const gate = f.gate();
    await core.send('s', 'A', JSON.stringify({ records: [boundary, message('toolUse')],
      abort: { records: [settled(true)], gate: gate.id } }));
    const cancel = core.cancel('s', 'A');
    await f.phase('abort-received');
    if (cleanup === 'stop') await core.stop('s'); else await core.shutdown();
    assert.equal((await cancel).status, 'unknown');
    assert.equal(statuses.includes('cancelled'), false);
    f.assertHealthy();
  });
}

test('pi cancel: channel loss after received abort is unknown, not cancelled', async t => {
  const f = await fixture(t);
  await f.start();
  await f.send({ records: [boundary, message('toolUse')], abort: { eof: true } });
  assert.equal((await f.port.cancel!('s', 'i')).kind, 'unknown');
  await f.phase('abort-received');
  assert.deepEqual(f.events, [{ type: 'input-failed', inputId: 'i', certainty: 'unknown' }]);
  assert.equal((await f.send({ records: final() }, 'B')).kind, 'unknown');
  f.assertHealthy();
});
