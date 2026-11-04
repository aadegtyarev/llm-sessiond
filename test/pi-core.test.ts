import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SessionCore } from '../src/core.ts';
import { boundary, final, fixture } from './pi-support.ts';

for (const disposition of ['handled', 'queued']) {
  test(`pi core ${disposition} keeps unknown and blocks sends`, async (t) => {
    const f = await fixture(t);
    const core = new SessionCore(f.port);
    f.ids.add('s');
    core.create('s');
    await core.start('s');
    const result = await core.send('s', 'i', JSON.stringify({
      disposition, batch: true, records: final(),
    }));
    assert.deepEqual(result, { inputId: 'i', status: 'unknown' });
    await assert.rejects(core.send('s', 'next', 'never written'), { code: 'input-in-flight' });
    assert.equal((await core.stop('s')).status, 'stopped');
  });
}

test('pi core receives asynchronous active loss as unknown, not success', async (t) => {
  const f = await fixture(t);
  const core = new SessionCore(f.port);
  f.ids.add('s');
  core.create('s');
  await core.start('s');
  await core.send('s', 'i', JSON.stringify({ records: [boundary], eof: true }));
  await f.until(() => core.get('s').input?.status === 'unknown', 'core active loss');
  await core.stop('s');
});

test('pi unknown stop ignores stale source events and permits explicit cleanup', async (t) => {
  const f = await fixture(t, ['--hold-stop']);
  const core = new SessionCore(f.port);
  f.ids.add('s');
  core.create('s');
  await core.start('s');
  const events: unknown[] = [];
  core.subscribe((event) => { events.push(event); });
  const late = f.gate();
  await core.send('s', 'i', JSON.stringify({ records: [boundary], laterGate: late.id, later: [
    { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'stale' } },
    ...final(),
  ] }));
  await assert.rejects(core.stop('s'), { code: 'harness-unknown' });
  const snapshot = [
    { type: 'input', sessionId: 's', input: { inputId: 'i', status: 'pending' } },
    { type: 'input', sessionId: 's', input: { inputId: 'i', status: 'unknown' } },
    { type: 'session', session: { sessionId: 's', status: 'unknown',
      input: { inputId: 'i', status: 'unknown' } } },
  ];
  assert.deepEqual(events, snapshot);
  assert.equal(late.written(), false);
  late.release();
  await f.until(late.written, 'child wrote post-unknown-stop records');
  assert.deepEqual(events, snapshot);
  assert.equal(core.get('s').status, 'unknown');
  assert.equal((await core.stop('s')).status, 'stopped');
  await f.closed(); // Host close, not just child-written trace or process exit.
  assert.deepEqual(core.get('s'), { sessionId: 's', status: 'stopped',
    input: { inputId: 'i', status: 'unknown' } });
  assert.deepEqual(events, [...snapshot, { type: 'session', session: core.get('s') }]);
});
