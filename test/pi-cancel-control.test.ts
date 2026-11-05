import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boundary, message, settled, fixture } from './pi-support.ts';

const assistants = [
  ['absent', []],
  ['malformed', [{ type: 'message_end', message: { role: 'assistant', stopReason: 'stop' } }]],
] as const;

for (const [name, records] of assistants) {
  test(`pi cancel control: ${name} assistant neither proves nor vetoes independent control`, async t => {
    const f = await fixture(t);
    await f.start();
    await f.send({ records: [boundary], abort: { records: [...records, settled(true)] } });
    assert.equal((await f.port.cancel!('s', 'i')).kind, 'confirmed');
    await f.phase('abort-received');
    assert.deepEqual(f.events, [{ type: 'input-cancelled', inputId: 'i' }]);
    assert.equal((await f.send({ records: [boundary, message('stop'), settled()] }, 'B')).kind, 'confirmed');
    assert.deepEqual(f.events.at(-1), { type: 'input-completed', inputId: 'B' });
    f.assertHealthy();
  });
}

for (const [name, records] of assistants) {
  test(`pi normal terminal: ${name} assistant remains unknown without cancel control`, async t => {
    const f = await fixture(t);
    await f.start();
    await f.send({ records: [boundary, ...records, settled(true)] });
    assert.deepEqual(f.events, [{ type: 'input-failed', inputId: 'i', certainty: 'unknown' }]);
    assert.equal((await f.send({ records: [boundary, message('stop'), settled()] }, 'B')).kind, 'unknown');
    assert.equal(f.phases().filter(p => p === 'abort-received').length, 0);
    f.assertHealthy();
  });
}

test('pi cancel control: own settled true without successful abort cannot release B', async t => {
  const f = await fixture(t);
  await f.start();
  await f.send({ records: [boundary, message('stop')], abort: { success: false, records: [settled(true)] } });
  assert.equal((await f.port.cancel!('s', 'i')).kind, 'unknown');
  await f.phase('abort-received');
  assert.deepEqual(f.events, [{ type: 'input-failed', inputId: 'i', certainty: 'unknown' }]);
  assert.equal((await f.send({ records: [boundary, message('stop'), settled()] }, 'B')).kind, 'unknown');
  f.assertHealthy();
});
