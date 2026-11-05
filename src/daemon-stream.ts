import type { ServerResponse } from 'node:http';
import type { SessionCore } from './core.ts';

export function openEventStream(core: SessionCore, response: ServerResponse, onClose: () => void) {
  let unsubscribe = () => {};
  const writer = streamWriter(response, () => { unsubscribe(); onClose(); });
  response.writeHead(200, {
    'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  unsubscribe = core.subscribe(event => writer.send('core', event));
  writer.send('ready', {});
  return () => { writer.close(); response.end(); };
}

export const STREAM_BYTES = 1_048_576;
export const STREAM_FRAMES = 256;
export const STREAM_CLIENTS = 32;

// Includes Node's writable buffer, not just the application queue. Overflow is loss.
export function streamWriter(response: ServerResponse, onClose: () => void) {
  const queue: string[] = [];
  let bytes = 0;
  let blocked = false;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    queue.length = 0;
    bytes = 0;
    onClose();
  };
  response.once('close', close);
  response.once('error', () => { close(); response.destroy(); });
  return { close, get closed() { return closed; }, send };

  function send(event: string, data: unknown) {
    if (closed) return;
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    const size = Buffer.byteLength(frame);
    if (queue.length >= STREAM_FRAMES || bytes + response.writableLength + size > STREAM_BYTES) {
      close(); response.destroy(); return;
    }
    queue.push(frame); bytes += size;
    flush();
  }
  function flush() {
    while (!closed && !blocked && queue.length) {
      const frame = queue.shift()!;
      bytes -= Buffer.byteLength(frame);
      try { blocked = !response.write(frame); }
      catch { close(); response.destroy(); return; }
      if (blocked) response.once('drain', () => { blocked = false; flush(); });
    }
  }
}
