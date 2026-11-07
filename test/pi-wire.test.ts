import assert from 'node:assert/strict';
import { test } from 'node:test';
import { wireDouble } from './pi-wire-double.ts';

test('pi wire response still waits for local callback and backpressure', async (t) => {
  const f = wireDouble();
  t.after(f.cleanup);
  let returned = false;
  const result = f.wire.command('prompt', { message: 'text' });
  void result.then(() => { returned = true; });
  const native = { data: { disposition: 'started', optional: { usage: 7 } }, metadata: ['opaque'] };
  f.respond(native);
  await Promise.resolve();
  assert.equal(returned, false);
  f.release();
  assert.deepEqual(await result, { type: 'response', id: f.frames[0].id, command: 'prompt', success: true, ...native });
  assert.equal(f.losses, 0);
});

for (const kind of ['write-error', 'write-throw', 'exit', 'close', 'eof', 'malformed', 'wrong-command', 'stdin-error', 'stdout-error', 'child-error']) {
  test(`pi wire uncertainty ${kind}`, async (t) => {
    const f = wireDouble();
    t.after(f.cleanup);
    if (kind === 'write-throw') f.stdin.write = () => { throw new Error('private'); };
    const result = f.wire.command('prompt');
    if (kind === 'write-error') f.release(new Error('private'));
    if (kind === 'exit' || kind === 'close') f.child.emit(kind, 0);
    if (kind === 'wrong-command') f.respond({ command: 'other' });
    if (kind === 'stdin-error') f.stdin.emit('error', new Error('private'));
    if (kind === 'stdout-error') f.stdout.emit('error', new Error('private'));
    if (kind === 'child-error') f.child.emit('error', new Error('private'));
    if (kind === 'eof') f.stdout.end('{truncated');
    if (kind === 'malformed') f.stdout.write('[]\n');
    assert.equal(await result, null);
    assert.equal(f.losses, 1);
  });
}

test('pi wire: an already received whole Native response survives loss before local drain', async t => {
  const f = wireDouble(); t.after(f.cleanup);
  const command = f.wire.command('compact');
  const native = { success: false, error: 'native refusal', optionalMetadata: { all: [1] } };
  f.respond(native);
  f.child.emit('exit', 0);
  assert.deepEqual(await command, { type: 'response', id: f.frames[0].id, command: 'compact', ...native });
  assert.equal(f.losses, 1);
});

test('pi late duplicate response A never resolves command B', async (t) => {
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

test('pi wire correlates reverse responses and events do not complete RPCs', async t => {
  const f = wireDouble(); t.after(f.cleanup);
  let firstDone = false;
  const first = f.wire.command('compact', { customInstructions: 'all fields' });
  void first.then(() => { firstDone = true; });
  f.release();
  const second = f.wire.command('abort');
  f.release();
  assert.notEqual(f.frames[0].id, f.frames[1].id);
  for (const type of ['agent_start', 'tool_execution_end', 'agent_end', 'agent_settled']) {
    f.stdout.write(JSON.stringify({ type }) + '\n');
  }
  f.respond({ success: false, error: 'native refusal', optional: { busy: true } }, 1);
  assert.deepEqual(await second, { type: 'response', id: f.frames[1].id, command: 'abort',
    success: false, error: 'native refusal', optional: { busy: true } });
  assert.equal(firstDone, false);
  f.respond({ data: { summary: 'whole', tokensBefore: 150000, estimatedTokensAfter: 42, details: [1] } }, 0);
  assert.deepEqual((await first)?.data, { summary: 'whole', tokensBefore: 150000, estimatedTokensAfter: 42, details: [1] });
  assert.equal(f.losses, 0);
});

test('pi wire: many pending writes share drain handling and correlate all responses in reverse', async t => {
  const f = wireDouble(); t.after(f.cleanup);
  const pending = Array.from({ length: 24 }, (_, index) => f.wire.command('prompt', { index }));
  for (let index = 0; index < pending.length; index++) f.release();
  assert.equal(f.frames.length, 24);
  assert.equal(f.stdin.listenerCount('drain'), 1);
  for (let index = pending.length - 1; index >= 0; index--) f.respond({ data: { index } }, index);
  const responses = await Promise.all(pending);
  assert.deepEqual(responses.map(record => record?.data), Array.from({ length: 24 }, (_, index) => ({ index })));
  assert.equal(f.losses, 0);
});

for (const invalid of [
  { type: 'response', id: 2, command: 'prompt', success: true },
  { type: 'response', id: 'r', command: 2, success: true },
  { type: 'response', id: 'r', command: 'prompt', success: 'true' },
  { type: 2 }, [], null,
]) {
  test(`pi wire: malformed response envelope fails pending channel ${JSON.stringify(invalid)}`, async t => {
    const f = wireDouble(); t.after(f.cleanup);
    const request = f.wire.command('prompt');
    f.stdout.write(JSON.stringify(invalid) + '\n');
    assert.equal(await request, null); assert.equal(f.losses, 1);
  });
}

test('pi wire: waiting beyond former 10s deadline neither breaks nor blocks abort/UI writes', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = wireDouble(); t.after(f.cleanup);
  let done = false;
  const compact = f.wire.command('compact'); void compact.then(() => { done = true; });
  f.release();
  t.mock.timers.tick(60_000); await Promise.resolve();
  assert.equal(done, false); assert.equal(f.wire.broken, false);
  const abort = f.wire.command('abort'); f.release(); f.respond(); await abort;
  const reply = f.wire.write({ type: 'extension_ui_response', id: 'q', value: 'answer' });
  f.release(); assert.deepEqual(await reply, { kind: 'written' });
  assert.equal(done, false); assert.equal(f.frames.length, 3);
  f.respond({ data: { summary: 'delayed' } }, 0);
  assert.deepEqual((await compact)?.data, { summary: 'delayed' });
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
