import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { ReplyOutcome } from './types.ts';

export type RecordValue = { [key: string]: unknown };
export function object(value: unknown): RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue : {};
}

export function createPiWire(
  child: ChildProcessWithoutNullStreams,
  event: (record: RecordValue) => void, lost: () => void,
) {
  let broken = false;
  let buffer = '';
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  const writes = new Set<() => void>();
  const pending = new Map<string, {
    command: string; finish: (record: RecordValue | null) => void;
  }>();
  function fail() {
    if (broken) return;
    broken = true;
    for (const request of [...pending.values()]) request.finish(null);
    for (const finish of [...writes]) finish();
    lost();
  }
  child.stdout.on('data', (chunk: Buffer) => {
    if (broken) return;
    try {
      buffer += decoder.decode(chunk, { stream: true });
      let end: number;
      while (!broken && (end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end).replace(/\r$/, '');
        buffer = buffer.slice(end + 1);
        const record = object(JSON.parse(line));
        if (typeof record.type !== 'string') { fail(); break; }
        if (record.type !== 'response') { event(record); continue; }
        if (typeof record.id !== 'string' || typeof record.command !== 'string'
          || typeof record.success !== 'boolean') { fail(); break; }
        const request = pending.get(record.id);
        if (!request) continue; // Late/unrelated replies never claim a newer command.
        if (record.command !== request.command || typeof record.success !== 'boolean') {
          fail(); break;
        }
        request.finish(record);
      }
    } catch { fail(); }
  });
  child.stdout.on('end', fail);
  child.stdout.on('error', fail);
  child.stdin.on('error', fail);
  child.on('error', fail);
  child.on('exit', fail);
  child.on('close', fail);
  child.stderr.resume();
  child.stderr.on('error', fail);
  function command(type: string, data: RecordValue = {}) {
    return new Promise<RecordValue | null>((resolve) => {
      if (broken) { resolve(null); return; }
      const id = randomUUID();
      let response: RecordValue | null = null;
      let written = false;
      let drained = true;
      const finish = (record: RecordValue | null) => {
        if (!pending.delete(id)) return;
        child.stdin.off('drain', onDrain);
        resolve(record);
      };
      const ready = () => { if (response && written && drained) finish(response); };
      const onDrain = () => { drained = true; ready(); };
      pending.set(id, { command: type, finish: (r) => {
        if (!r) finish(null);
        else {
          if (response) { fail(); return; }
          response = r;
          ready();
        }
      } });
      try {
        drained = child.stdin.write(JSON.stringify({ ...data, id, type }) + '\n', (error) => {
          if (error) { fail(); return; }
          written = true;
          ready();
        });
        if (!drained) child.stdin.once('drain', onDrain);
      } catch { fail(); }
    });
  }
  // UI responses have no command ACK. Resolve only local callback + backpressure.
  function write(record: RecordValue): Promise<ReplyOutcome> {
    return new Promise((resolve) => {
      if (broken) { resolve({ kind: 'unknown' }); return; }
      let written = false;
      let drained = true;
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        writes.delete(finish);
        child.stdin.off('drain', onDrain);
        resolve({ kind: broken ? 'unknown' : 'written' });
      };
      const ready = () => { if (written && drained) finish(); };
      const onDrain = () => { drained = true; ready(); };
      writes.add(finish);
      try {
        drained = child.stdin.write(JSON.stringify(record) + '\n', (error) => {
          if (error) { fail(); return; }
          written = true;
          ready();
        });
        if (!drained) child.stdin.once('drain', onDrain);
      } catch { fail(); }
    });
  }
  return { fail, command, write, get broken() { return broken; } };
}
