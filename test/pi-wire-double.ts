import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { createPiWire, type RecordValue } from '../src/pi-wire.ts';

export function wireDouble(event?: (record: RecordValue) => void) {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const frames: RecordValue[] = [];
  let written: ((error?: Error | null) => void) | undefined;
  const stdin = new Writable({ highWaterMark: 1, write(chunk, _encoding, callback) {
    frames.push(JSON.parse(String(chunk)));
    written = callback;
  } });
  const child = Object.assign(new EventEmitter(), { stdout, stderr, stdin });
  const events: RecordValue[] = [];
  let losses = 0;
  const wire = createPiWire(child as unknown as ChildProcessWithoutNullStreams,
    (record) => { events.push(record); event?.(record); }, () => { losses++; });
  function respond(extra: object = {}, index = frames.length - 1) {
    stdout.write(JSON.stringify({ type: 'response', id: frames[index].id,
      command: frames[index].type, success: true, ...extra }) + '\n');
  }
  function release(error?: Error) { const callback = written; written = undefined; callback?.(error); }
  function cleanup() { wire.fail(); release(); stdout.destroy(); stderr.destroy(); stdin.destroy(); }
  return { wire, frames, respond, release, cleanup, stdin, stdout, child, events,
    get losses() { return losses; },
  };
}
