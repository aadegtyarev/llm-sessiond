import { request } from 'node:http';
import type { Writable } from 'node:stream';

/** Internal CLI transport; no process launch, retries, response-wait deadline or event history. */
export async function callApi(port: number, token: string, method: string, path: string,
  body: Record<string, unknown> | undefined, events: boolean, output: Writable): Promise<0 | 1> {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const response = await new Promise<import('node:http').IncomingMessage>((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, method, path, agent: false,
      headers: { Authorization: `Bearer ${token}`, ...(payload === undefined ? {} : {
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload),
      }) } }, resolve);
    req.on('error', reject);
    req.end(payload);
  });
  try {
    const status = response.statusCode ?? 0;
    if (status >= 300 && status < 400) throw new Error('redirect');
    if (events && status === 200) {
      if (!/^text\/event-stream(?:\s*;\s*charset=utf-8)?$/i.test(response.headers['content-type'] ?? '')) throw new Error('content type');
      await forwardEvents(response, output);
      return 0;
    }
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(response.headers['content-type'] ?? '')) throw new Error('content type');
    const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
    let text = '';
    for await (const chunk of response) text += decoder.decode(chunk, { stream: true });
    text += decoder.decode();
    await writeOutput(output, JSON.stringify(JSON.parse(text)) + '\n');
    return status === 200 ? 0 : 1;
  } finally { response.destroy(); }
}

/** Written means local callback + drain, including stdout pipe errors. */
export function writeOutput(output: Writable, text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let written = false, drained = false, writing = true;
    const cleanup = () => { output.off('error', fail); output.off('drain', drain); };
    const fail = (error: Error) => { cleanup(); reject(error); };
    const ready = () => { if (!writing && written && drained) { cleanup(); resolve(); } };
    const drain = () => { drained = true; ready(); };
    output.once('error', fail);
    try {
      drained = output.write(text, error => {
        // Writable emits its error event after the callback; leave that listener installed.
        if (error) { output.off('drain', drain); reject(error); }
        else { written = true; ready(); }
      });
      writing = false;
      if (!drained) output.once('drain', drain);
      ready();
    } catch (error) { fail(error as Error); }
  });
}

// The daemon's existing per-stream byte budget also bounds an unfinished SSE frame.
const EVENT_BYTES = 1_048_576;
export async function forwardEvents(chunks: AsyncIterable<Uint8Array>, output: Writable): Promise<void> {
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  let buffer = '', lines: string[] = [], frameBytes = 0, ready = false;
  for await (const chunk of chunks) {
    buffer += decoder.decode(chunk, { stream: true });
    let end: number;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end).replace(/\r$/, '');
      buffer = buffer.slice(end + 1);
      frameBytes += Buffer.byteLength(line) + 1;
      if (frameBytes > EVENT_BYTES) throw new Error('frame limit');
      if (line !== '') { lines.push(line); continue; }
      if (lines.length !== 2 || !/^event: (ready|core)$/.test(lines[0]) || !lines[1].startsWith('data: ')) throw new Error('frame');
      const event = lines[0].slice(7), data: unknown = JSON.parse(lines[1].slice(6));
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('data');
      if ((!ready && event !== 'ready') || (ready && event === 'ready')
        || (event === 'ready' && Object.keys(data).length !== 0)) throw new Error('ready');
      ready = true;
      await writeOutput(output, JSON.stringify({ event, data }) + '\n');
      lines = []; frameBytes = 0;
    }
    if (frameBytes + Buffer.byteLength(buffer) > EVENT_BYTES) throw new Error('frame limit');
  }
  buffer += decoder.decode();
  if (!ready || buffer !== '' || lines.length !== 0) throw new Error('incomplete stream');
}
