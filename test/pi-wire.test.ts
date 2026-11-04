import assert from 'node:assert/strict';
import { test } from 'node:test';
import { wireDouble } from './pi-wire-double.ts';

test('pi wire applies ACK before continuation while respecting write backpressure', async (t) => {
  const f = wireDouble();
  t.after(f.cleanup);
  let acknowledged = false;
  let returned = false;
  const result = f.wire.command('prompt', { message: 'text' }, () => { acknowledged = true; });
  void result.then(() => { returned = true; });
  f.respond({ data: { disposition: 'started' } });
  assert.equal(acknowledged, true);
  await Promise.resolve();
  assert.equal(returned, false);
  f.release();
  assert.equal((await result)?.success, true);
  assert.equal(f.losses, 0);
});

for (const kind of ['write-error', 'write-throw', 'deadline', 'exit', 'eof', 'malformed']) {
  test(`pi wire uncertainty ${kind}`, async (t) => {
    const f = wireDouble(30);
    t.after(f.cleanup);
    if (kind === 'write-throw') f.stdin.write = () => { throw new Error('private'); };
    const result = f.wire.command('prompt');
    if (kind === 'write-error') f.release(new Error('private'));
    if (kind === 'exit') f.child.emit('exit', 0);
    if (kind === 'eof') f.stdout.end('{truncated');
    if (kind === 'malformed') f.stdout.write('[]\n');
    assert.equal(await result, null);
    assert.equal(f.losses, 1);
  });
}

test('pi late duplicate ACK A never resolves command B', async (t) => {
  const f = wireDouble();
  t.after(f.cleanup);
  const a = f.wire.command('prompt');
  f.respond();
  f.release();
  await a;
  let bReturned = false;
  const b = f.wire.command('get_state');
  void b.then(() => { bReturned = true; });
  assert.notEqual(f.frames[0].id, f.frames[1].id);
  f.respond({}, 0);
  await Promise.resolve();
  assert.equal(bReturned, false);
  f.respond();
  f.release();
  assert.equal((await b)?.command, 'get_state');
});

test('pi wire preserves UTF8 and Unicode separators across byte fragmentation', (t) => {
  const f = wireDouble();
  t.after(f.cleanup);
  const event = { type: 'message_update', assistantMessageEvent: {
    type: 'text_delta', delta: '🙂 Привет\u2028\u2029',
  } };
  for (const ending of ['\n', '\r\n']) {
    const bytes = Buffer.from(JSON.stringify(event) + ending);
    for (const byte of bytes) f.stdout.write(Buffer.from([byte]));
  }
  assert.deepEqual(f.events, [event, event]);
});

for (const bytes of [Buffer.from([0xe2, 0x82]), Buffer.from([0xff]), Buffer.from('\ufeff{}\n')]) {
  test('pi invalid/truncated UTF8 stream cannot establish readiness', async (t) => {
    const f = wireDouble();
    t.after(f.cleanup);
    const command = f.wire.command('get_state');
    f.stdout.end(bytes);
    assert.equal(await command, null);
  });
}
