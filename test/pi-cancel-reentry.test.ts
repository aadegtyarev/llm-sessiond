import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SessionCore, type InputView } from '../src/core.ts';
import { boundary, message, settled, final, fixture } from './pi-support.ts';

test('pi cancel reentry: native control fence opens before cancelled subscriber sends B', async t => {
  const f = await fixture(t);
  const core = new SessionCore(f.port);
  core.create('s'); await core.start('s');
  const gate = f.gate();
  await core.send('s', 'A', JSON.stringify({ records: [boundary],
    abort: { records: [settled(true)], gate: gate.id } }));
  const delivered: string[] = [];
  let next: Promise<InputView | unknown> | undefined;
  core.subscribe(e => { if (e.type === 'input') delivered.push(e.input.inputId + ':' + e.input.status); });
  core.subscribe(e => {
    if (e.type === 'input' && e.input.status === 'cancelled') {
      next = core.send('s', 'B', JSON.stringify({ records: final() })).catch(error => error);
    }
  });
  const cancel = core.cancel('s', 'A');
  await f.phase('abort-received');
  assert.deepEqual(delivered, []);
  gate.release();
  assert.deepEqual(await cancel, { inputId: 'A', status: 'cancelled' });
  assert.deepEqual(await next, { inputId: 'B', status: 'completed' });
  assert.deepEqual(delivered, ['A:cancelled', 'B:pending', 'B:completed']);
  assert.equal(f.phases().filter(p => p === 'abort-received').length, 1);
  assert.equal(f.phases().filter(p => p === 'prompt').length, 2);
  assert.equal(core.get('s').status, 'running');
  f.assertHealthy();
});

for (const reason of ['stop', 'error'] as const) {
  test(`pi cancel reentry: natural ${reason} before late ACK never opens early B`, async t => {
    const f = await fixture(t);
    const core = new SessionCore(f.port);
    core.create('s'); await core.start('s');
    const gate = f.gate();
    await core.send('s', 'A', JSON.stringify({ records: [boundary],
      abort: { records: [message(reason), settled(false)], gate: gate.id } }));
    let early: Promise<unknown> | undefined;
    const status = reason === 'stop' ? 'completed' : 'failed';
    core.subscribe(e => {
      if (e.type === 'input' && e.input.inputId === 'A' && e.input.status === status) {
        early = core.send('s', 'B', '{}').catch(error => error.code);
      }
    });
    const cancel = core.cancel('s', 'A');
    await f.phase('abort-received');
    await f.until(() => early !== undefined, 'natural terminal subscriber');
    assert.equal(await early, 'input-in-flight');
    gate.release();
    assert.deepEqual(await cancel, { inputId: 'A', status });
    await core.send('s', 'B', JSON.stringify({ records: final() }));
    assert.deepEqual(core.get('s').input, { inputId: 'B', status: 'completed' });
    assert.equal(f.phases().filter(p => p === 'abort-received').length, 1);
    f.assertHealthy();
  });
}
