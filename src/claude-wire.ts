import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { CoreError, type NativeCommand, type NativeRecord } from './types.ts';

export function claudeObject(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

export function createClaudeWire(
  child: ChildProcessWithoutNullStreams,
  event: (record: NativeRecord) => void,
  lost: () => void,
) {
  let broken = false;
  let buffer = '';
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  const pending = new Map<string, (record: NativeRecord | null) => void>();
  const writes = new Set<() => void>();
  const drains = new Set<() => void>();
  function fail() {
    if (broken) return;
    broken = true;
    for (const finish of [...pending.values()]) finish(null);
    for (const finish of [...writes]) finish();
    lost();
  }
  child.stdin.on('drain', () => {
    const waiting = [...drains];
    drains.clear();
    for (const ready of waiting) ready();
  });
  child.stdout.on('data', (chunk: Buffer) => {
    if (broken) return;
    try {
      buffer += decoder.decode(chunk, { stream: true });
      let end: number;
      while (!broken && (end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end).replace(/\r$/, '');
        buffer = buffer.slice(end + 1);
        const record = claudeObject(JSON.parse(line));
        if (!record || typeof record.type !== 'string') { fail(); break; }
        if (record.type === 'control_response') {
          const response = claudeObject(record.response);
          if (!response || typeof response.request_id !== 'string'
            || (response.subtype !== 'success' && response.subtype !== 'error')) {
            fail(); break;
          }
          // Resolve on the native answer, not an unrelated local drain/callback.
          pending.get(response.request_id)?.(record);
        } else {
          if (record.type === 'control_request'
            && (typeof record.request_id !== 'string'
              || typeof claudeObject(record.request)?.subtype !== 'string')) {
            fail(); break;
          }
          if (record.type === 'control_cancel_request' && typeof record.request_id !== 'string') {
            fail(); break;
          }
          event(record);
        }
      }
    } catch { fail(); }
  });
  child.stdout.on('end', () => {
    // EOF always loses the channel, including trailing JSON/UTF8 fragments.
    try { decoder.decode(); } catch { /* Never expose the private decoding error. */ }
    fail();
  });
  child.stdout.on('error', fail);
  child.stdin.on('error', fail);
  child.stderr.on('error', fail);
  child.stderr.resume();
  child.on('error', fail);
  child.on('exit', fail);
  child.on('close', fail);

  function encode(record: NativeRecord): string {
    try { return JSON.stringify(record) + '\n'; }
    catch { throw new CoreError('harness-rejected'); }
  }

  function writeLine(line: string): Promise<'written' | 'unknown'> {
    return new Promise(resolve => {
      if (broken) { resolve('unknown'); return; }
      let written = false;
      let drained = false;
      let returned = false;
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        writes.delete(finish);
        drains.delete(onDrain);
        resolve(broken ? 'unknown' : 'written');
      };
      const ready = () => { if (returned && written && drained) finish(); };
      const onDrain = () => { drained = true; ready(); };
      writes.add(finish);
      try {
        drained = child.stdin.write(line, error => {
          if (error) { fail(); return; }
          written = true;
          ready();
        });
        returned = true;
        if (!drained && !settled) drains.add(onDrain);
        ready();
      } catch { fail(); }
    });
  }

  function control(command: NativeCommand): Promise<NativeRecord | null> {
    const request = claudeObject(command.request);
    if (typeof request?.subtype !== 'string'
      || ('request_id' in command && typeof command.request_id !== 'string')) {
      throw new CoreError('harness-rejected');
    }
    const id = typeof command.request_id === 'string' ? command.request_id : randomUUID();
    if (pending.has(id)) throw new CoreError('harness-rejected');
    const line = encode({ ...command, request_id: id });
    if (broken) return Promise.resolve(null);
    return new Promise(resolve => {
      pending.set(id, record => {
        if (!pending.delete(id)) return;
        resolve(record);
      });
      void writeLine(line);
    });
  }

  async function command(command: NativeCommand) {
    if (command.type === 'compact') throw new CoreError('harness-rejected');
    if (command.type === 'control_request') return control(command);
    const outcome = await writeLine(encode(command));
    if (outcome !== 'written') throw new CoreError('harness-unknown');
    return { kind: 'written' } as const;
  }
  return { fail, command, get broken() { return broken; } };
}
