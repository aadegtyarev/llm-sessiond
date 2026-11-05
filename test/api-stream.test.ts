import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';
import { test } from 'node:test';
import { streamWriter, STREAM_BYTES, STREAM_FRAMES } from '../src/daemon-stream.ts';

function responseDouble() {
  const response = new EventEmitter();
  let writableLength = 0;
  let blocked = false;
  let destroyed = false;
  let throws = false;
  const frames: string[] = [];
  const output = Object.assign(response, {
    get writableLength() { return writableLength; },
    write(frame: string) {
      if (throws) throw new Error('private stream fault');
      frames.push(frame); writableLength += blocked ? Buffer.byteLength(frame) : 0;
      return !blocked;
    },
    destroy() { destroyed = true; response.emit('close'); },
  });
  // Object.assign evaluates getters; use a live descriptor for the writable buffer.
  Object.defineProperty(output, 'writableLength', { get: () => writableLength });
  return { output: output as unknown as ServerResponse, frames,
    block: () => { blocked = true; }, fail: () => { throws = true; },
    drain: () => { blocked = false; writableLength = 0; response.emit('drain'); },
    get destroyed() { return destroyed; },
  };
}

test('daemon stream preserves FIFO through real drain signals without blocking another consumer', () => {
  const slow = responseDouble(); const fast = responseDouble();
  let closes = 0;
  const a = streamWriter(slow.output, () => { closes++; });
  const b = streamWriter(fast.output, () => { closes++; });
  slow.block();
  for (const value of [1, 2, 3]) { a.send('core', value); b.send('core', value); }
  assert.equal(slow.frames.length, 1); assert.equal(fast.frames.length, 3);
  slow.drain();
  assert.deepEqual(slow.frames, fast.frames); assert.equal(closes, 0);
});

for (const mode of ['frames', 'bytes', 'oversize-frame', 'write-error', 'response-error']) {
  test(`daemon stream closes on ${mode}, never silently drops/truncates`, () => {
    const response = responseDouble();
    let closes = 0;
    const writer = streamWriter(response.output, () => { closes++; });
    if (mode === 'write-error') { response.fail(); writer.send('core', 1); }
    else if (mode === 'response-error') response.output.emit('error', new Error('private'));
    else if (mode === 'oversize-frame') writer.send('core', 'x'.repeat(STREAM_BYTES));
    else {
      response.block(); writer.send('core', 0);
      const payload = mode === 'bytes' ? 'x'.repeat(STREAM_BYTES / 2) : 'x';
      for (let i = 0; i <= STREAM_FRAMES; i++) writer.send('core', payload);
    }
    assert.equal(writer.closed, true); assert.equal(response.destroyed, true); assert.equal(closes, 1);
    const count = response.frames.length;
    response.drain(); writer.send('core', 'never');
    assert.equal(response.frames.length, count);
  });
}
