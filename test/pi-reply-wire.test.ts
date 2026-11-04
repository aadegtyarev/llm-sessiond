import assert from 'node:assert/strict';
import test from 'node:test';
import { wireDouble } from './pi-wire-double.ts';
import { allowanceMs } from './pi-observation.ts';

const record = { type: 'extension_ui_response', id: 'fixture', confirmed: true };

test('pi-reply-wire: local callback/backpressure succeeds WITHOUT any ACK', async t => {
  const host = wireDouble(allowanceMs); t.after(host.cleanup);
  let resolved = false;
  const reply = host.wire.write(record).then(value => { resolved = true; return value; });
  await Promise.resolve();
  assert.equal(resolved, false);
  assert.deepEqual(host.frames, [record]);
  host.release();
  assert.deepEqual(await reply, { kind: 'written' });
  assert.equal(host.losses, 0);
});

for (const fault of ['callback', 'stdin', 'stdout', 'exit', 'close', 'timeout', 'stop'] as const) {
  test(`pi-reply-wire: ${fault} yields unknown, never consumed`, async t => {
    const host = wireDouble(fault === 'timeout' ? 20 : allowanceMs); t.after(host.cleanup);
    const reply = host.wire.write(record);
    if (fault === 'callback') host.release(new Error('private'));
    if (fault === 'stdin') host.stdin.emit('error', new Error('private'));
    if (fault === 'stdout') host.stdout.end();
    if (fault === 'exit' || fault === 'close') host.child.emit(fault);
    if (fault === 'stop') host.wire.fail();
    assert.deepEqual(await reply, { kind: 'unknown' });
    assert.deepEqual(await host.wire.write(record), { kind: 'unknown' });
    assert.equal(host.frames.length, 1);
  });
}
