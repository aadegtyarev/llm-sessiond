import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boundary, final, fixture, message, settled, until } from './pi-support.ts';

for (const [reason, aborted, expected] of [
  ['stop', false, 'completed'], ['error', false, 'definitive'],
  ['aborted', true, 'definitive'], ['length', false, 'unknown'],
  ['toolUse', false, 'unknown'], ['pending', false, 'unknown'],
  ['deferred', false, 'unknown'], ['future', false, 'unknown'],
  ['stop', true, 'unknown'], ['error', true, 'unknown'],
  ['aborted', false, 'unknown'], ['stop', undefined, 'unknown'],
] as const) {
  test(`pi terminal evidence ${reason}/${String(aborted)}`, async (t) => {
    const f = await fixture(t);
    assert.equal((await f.start()).kind, 'confirmed');
    const records = final(reason, aborted === undefined ? null : aborted);
    assert.equal((await f.send({ records })).kind, 'confirmed');
    await until(() => f.events.some((e) => e.type !== 'text'));
    assert.deepEqual(f.events, [expected === 'completed'
      ? { type: 'input-completed', inputId: 'i' }
      : { type: 'input-failed', inputId: 'i', certainty: expected }]);
  });
}

for (const records of [
  [boundary, settled()], [message('stop'), settled()], [settled()],
  [boundary, message('stop'), { type: 'agent_settled' }],
  [boundary, { type: 'message_end', message: { role: 'assistant' } }, settled()],
]) {
  test('pi missing final message or own boundary is unknown', async (t) => {
    const f = await fixture(t);
    await f.start();
    await f.send({ records });
    await until(() => f.events.length > 0);
    assert.deepEqual(f.events, [{ type: 'input-failed', inputId: 'i', certainty: 'unknown' }]);
  });
}

test('pi retry error and agent_end do not settle input', async (t) => {
  const f = await fixture(t);
  await f.start();
  await f.send({ records: [boundary, message('error'),
    { type: 'agent_end', willRetry: true }, { type: 'auto_retry_start' }] });
  assert.deepEqual(f.events, []);
});

test('pi retries stay native; last final assistant evidence wins', async (t) => {
  const f = await fixture(t);
  await f.start();
  await f.send({ records: [boundary, message('error'),
    { type: 'agent_end', willRetry: true }, { type: 'auto_retry_start' },
    ...final()] });
  await until(() => f.events.length > 0);
  assert.deepEqual(f.events, [{ type: 'input-completed', inputId: 'i' }]);
});

for (const disposition of ['handled', 'queued', 'future']) {
  test(`pi ${disposition} never claims anonymous settlement`, async (t) => {
    const f = await fixture(t);
    await f.start();
    assert.equal((await f.send({ disposition, records: final() })).kind, 'unknown');
    assert.equal((await f.send({ records: final() }, 'next')).kind, 'unknown');
    assert.deepEqual(f.events, []);
  });
}

for (const beforeAck of [[boundary], final()]) {
  test('pi late ACK cannot claim preceding anonymous run', async (t) => {
    const f = await fixture(t);
    await f.start();
    assert.equal((await f.send({ beforeAck, records: final() })).kind, 'unknown');
    assert.deepEqual(f.events, []);
  });
}
