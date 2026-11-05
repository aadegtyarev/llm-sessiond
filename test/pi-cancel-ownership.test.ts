import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPiRun } from '../src/pi-run.ts';
import type { HarnessEvent } from '../src/types.ts';
import { deferred } from './fake-port.ts';
import { boundary, final, message, settled } from './pi-records.ts';
import type { RecordValue } from '../src/pi-wire.ts';

function owned() {
  const events: HarnessEvent[] = [];
  const run = createPiRun(e => events.push(e));
  const input = run.begin('A')!;
  run.acknowledge(input, { success: true, data: { disposition: 'started' } });
  run.event(boundary);
  return { run, events };
}

test('pi cancel ownership: natural terminal A, late ACK, then B is untouched', async () => {
  const { run, events } = owned();
  const ack = deferred<RecordValue | null>();
  const cancel = run.cancel('A', () => ack.promise);
  run.event(message('stop')); run.event(settled());
  assert.deepEqual(events, [{ type: 'input-completed', inputId: 'A' }]);
  assert.equal(run.begin('B'), null);
  ack.resolve({ success: true }); await cancel;
  const b = run.begin('B')!;
  assert.ok(b);
  run.acknowledge(b, { success: true, data: { disposition: 'started' } });
  final().forEach(run.event);
  assert.deepEqual(events.at(-1), { type: 'input-completed', inputId: 'B' });
});

for (const disposition of ['pending', 'handled', 'queued', 'unknown', 'unowned', 'no-boundary']) {
  test(`pi cancel ownership rejects ${disposition} before writing native abort`, async () => {
    const run = createPiRun(() => {});
    const input = run.begin('A')!;
    if (disposition !== 'pending' && disposition !== 'unowned') {
      run.acknowledge(input, { success: true, data: {
        disposition: disposition === 'no-boundary' ? 'started' : disposition,
      } });
    }
    if (disposition === 'unowned') run.event(boundary);
    let writes = 0;
    const result = await run.cancel('A', async () => { writes++; return { success: true }; });
    assert.equal(result.kind, 'rejected');
    assert.equal(writes, 0);
  });
}

test('pi cancel ownership: wrong ID, duplicate, old ID after B never write', async () => {
  const { run, events } = owned();
  let writes = 0;
  const ack = deferred<RecordValue | null>();
  const abort = () => { writes++; return ack.promise; };
  assert.equal((await run.cancel('wrong', abort)).kind, 'rejected');
  const first = run.cancel('A', abort);
  assert.equal((await run.cancel('A', abort)).kind, 'rejected');
  run.event(message('toolUse')); run.event(settled(true));
  assert.deepEqual(events, []);
  ack.resolve({ success: true }); await first;
  assert.deepEqual(events, [{ type: 'input-cancelled', inputId: 'A' }]);
  assert.ok(run.begin('B'));
  assert.equal((await run.cancel('A', abort)).kind, 'rejected');
  assert.equal(writes, 1);
});

test('pi cancel ownership: rejected abort keeps active input and never cancels it', async () => {
  const { run, events } = owned();
  assert.equal((await run.cancel('A', async () => ({ success: false }))).kind, 'rejected');
  assert.equal(run.begin('B'), null);
  run.event(message('stop')); run.event(settled());
  assert.deepEqual(events, [{ type: 'input-completed', inputId: 'A' }]);
});
