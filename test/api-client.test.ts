import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Writable } from 'node:stream';
import { forwardEvents, writeOutput } from '../src/api-client.ts';
import { deferred } from './fake-port.ts';

const ready = 'event: ready\ndata: {}\n\n';
function output() {
  let text = '';
  const stream = new Writable({ write(bytes, _encoding, done) { text += bytes; done(); } });
  return { stream, get text() { return text; } };
}
async function* chunks(bytes: Uint8Array) { for (const byte of bytes) yield Buffer.from([byte]); }
async function* oneChunk(text: string) { yield Buffer.from(text); }

test('api-client SSE: fragmented UTF8/CRLF and Unicode separators become exact NDJSON', async () => {
  const data = { type: 'text', sessionId: 's', text: '🙂 Привет\u2028\u2029\nnext' };
  const wire = ready + `event: core\ndata: ${JSON.stringify(data)}\n\n`;
  const sink = output();
  await forwardEvents(chunks(Buffer.from(wire.replaceAll('\n', '\r\n'))), sink.stream);
  assert.equal(sink.text, JSON.stringify({ event: 'ready', data: {} }) + '\n'
    + JSON.stringify({ event: 'core', data }) + '\n');
});

for (const wire of ['', 'event: core\ndata: {}\n\n', ready + ready,
  'event: ready\ndata: {"extra":1}\n\n', ready + 'event: other\ndata: {}\n\n',
  ready + 'event: core\ndata: null\n\n', ready + 'event: core\ndata: []\n\n',
  ready + 'event: core\ndata: {\n\n', ready + 'event: core\ndata: {}\n',
  '\ufeff' + ready, ready + 'x'.repeat(1_048_577)]) {
  test(`api-client SSE rejects malformed/unready/incomplete/bounded frame (${wire.length}, ${wire.slice(0, 30)})`, async () => {
    const sink = output();
    await assert.rejects(forwardEvents(oneChunk(wire), sink.stream));
  });
}

for (const bytes of [Buffer.from([0xff]), Buffer.from([0xe2, 0x82])]) {
  test('api-client SSE rejects invalid/truncated UTF8, not a clean EOF', async () => {
    const sink = output();
    async function* source() { yield Buffer.from(ready); yield bytes; }
    await assert.rejects(forwardEvents(source(), sink.stream));
    assert.equal(sink.text, '{"event":"ready","data":{}}\n');
  });
}

test('api-client SSE: bounded forward-only processing waits for callback+drain before pulling more input', async () => {
  const first = deferred<void>(), second = deferred<void>();
  let pulls = 0, writes = 0, release!: () => void;
  const sink = new Writable({ highWaterMark: 1, write(_bytes, _encoding, done) {
    release = done; writes++; (writes === 1 ? first : second).resolve();
  } });
  async function* source() {
    pulls++; yield Buffer.from(ready);
    pulls++; yield Buffer.from('event: core\ndata: {"type":"text","text":"future"}\n\n');
  }
  const forwarding = forwardEvents(source(), sink);
  await first.promise;
  assert.equal(pulls, 1); assert.equal(writes, 1);
  release(); await second.promise;
  assert.equal(pulls, 2); assert.equal(writes, 2);
  release(); await forwarding;
  assert.equal(sink.listenerCount('drain'), 0);
});

test('api-client output errors reject safely instead of hanging or emitting an unhandled exception', async () => {
  const sink = new Writable({ write(_bytes, _encoding, done) { done(new Error('private')); } });
  await assert.rejects(writeOutput(sink, 'product\n'));
});
