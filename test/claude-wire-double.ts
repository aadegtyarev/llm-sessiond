import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { createClaudeWire } from '../src/claude-wire.ts';
import type { NativeRecord } from '../src/types.ts';

export function claudeWireDouble() {
  const frames: Record<string, unknown>[] = [];
  const callbacks: ((error?: Error | null) => void)[] = [];
  const stdin = Object.assign(new EventEmitter(), {
    write(line: string, callback: (error?: Error | null) => void): boolean {
      frames.push(JSON.parse(line)); callbacks.push(callback); return false;
    },
    end() {},
  });
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const child = Object.assign(new EventEmitter(), { stdin, stdout, stderr, kill() { return true; } });
  const events: NativeRecord[] = [];
  let losses = 0;
  const wire = createClaudeWire(child as unknown as ChildProcessWithoutNullStreams,
    record => events.push(record), () => { losses++; });
  function send(record: unknown) { stdout.write(JSON.stringify(record) + '\n'); }
  return { wire, child, stdin, stdout, stderr, frames, callbacks, events, send,
    get losses() { return losses; },
    release(index = callbacks.length - 1) { callbacks[index](); stdin.emit('drain'); },
    respond(index = frames.length - 1, extra: Record<string, unknown> = {}) {
      const answer = { type: 'control_response', response: {
        subtype: 'success', request_id: frames[index].request_id, response: {}, ...extra,
      }, opaque: ['kept'] };
      send(answer); return answer;
    },
    cleanup() { wire.fail(); stdout.destroy(); stderr.destroy(); },
  };
}
