import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPiRun } from '../src/pi-run.ts';
import type { HarnessEvent } from '../src/types.ts';
import type { RecordValue } from '../src/pi-wire.ts';
import { deferred } from './fake-port.ts';
import { boundary, message, settled } from './pi-records.ts';

for (const after of [boundary, message('aborted'), settled(true)]) {
  test(`pi cancel evidence: extra ${after.type} after settlement invalidates cancellation`, async () => {
    const events: HarnessEvent[] = [];
    const run = createPiRun(e => events.push(e));
    const a = run.begin('A')!;
    run.acknowledge(a, { success: true, data: { disposition: 'started' } });
    run.event(boundary);
    const ack = deferred<RecordValue | null>();
    const pending = run.cancel('A', () => ack.promise);
    run.event(message('toolUse')); run.event(settled(true));
    run.event(after);
    ack.resolve({ success: true }); await pending;
    assert.deepEqual(events, [{ type: 'input-failed', inputId: 'A', certainty: 'unknown' }]);
    assert.equal(run.begin('B'), null);
  });
}

for (const response of [null, { success: false }]) {
  test(`pi cancel evidence: settled without successful abort ACK cannot cancel (${JSON.stringify(response)})`, async () => {
    const events: HarnessEvent[] = [];
    const run = createPiRun(e => events.push(e));
    const a = run.begin('A')!;
    run.acknowledge(a, { success: true, data: { disposition: 'started' } });
    run.event(boundary);
    const ack = deferred<RecordValue | null>();
    const pending = run.cancel('A', () => ack.promise);
    run.event(message('toolUse')); run.event(settled(true));
    ack.resolve(response); await pending;
    assert.deepEqual(events, [{ type: 'input-failed', inputId: 'A', certainty: 'unknown' }]);
    assert.equal(run.begin('B'), null);
  });
}
