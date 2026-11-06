// Fake Pi: it alone writes/reads standard JSONL history. No provider or project runtime imports.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { message, settled } from './pi-records.ts';

const evidence = process.argv[2];
const mode = process.argv[3];
const sessionFile = process.argv[process.argv.indexOf('--session') + 1];
const out = (record: unknown) => process.stdout.write(JSON.stringify(record) + '\n');
const healthFile = join(evidence, `${process.pid}.health`);
let entries: Record<string, any>[] = [];
let leaf: string | null = null;
function entry(value: Record<string, unknown>) {
  const record = { ...value, id: randomUUID().slice(0, 8), parentId: leaf, timestamp: new Date().toISOString() };
  appendFileSync(sessionFile, JSON.stringify(record) + '\n');
  entries.push(record); leaf = record.id;
}
function handle(command: Record<string, any>) {
  if (command.type === 'get_state') {
    out({ type: 'response', id: command.id, command: 'get_state', success: true,
      data: { isStreaming: false, sessionId: mode === 'wrong-id' ? randomUUID() : entries[0].id,
        sessionFile: mode === 'wrong-path' ? `${sessionFile}.other` : sessionFile } });
    return;
  }
  if (command.type !== 'prompt') throw new Error();
  const remembered = entries.find(record => record.type === 'message' && record.message?.role === 'user');
  const result = command.message === 'recall' ? String(remembered?.message.content ?? 'no-context') : 'marker-recorded';
  entry({ type: 'message', message: { role: 'user', content: command.message, timestamp: Date.now() } });
  out({ type: 'response', id: command.id, command: 'prompt', success: true, data: { disposition: 'started' } });
  out({ type: 'agent_start' });
  if (command.message === 'uncertain') return;
  const assistant = message('stop');
  entry({ type: 'message', message: assistant.message });
  out({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: result } });
  out(assistant); out(settled());
}
try {
  if (!process.argv.includes('--session') || process.argv.includes('--no-session')) throw new Error();
  if (readFileSync(sessionFile, 'utf8') === '') writeFileSync(sessionFile, JSON.stringify({
    type: 'session', version: 3, id: randomUUID(), timestamp: new Date().toISOString(), cwd: mode === 'wrong-cwd' ? join(process.cwd(), '..') : process.cwd(),
  }) + '\n');
  entries = readFileSync(sessionFile, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  leaf = entries.at(-1)?.type === 'session' ? null : entries.at(-1)!.id;
  writeFileSync(healthFile, 'healthy');
  // Native resource activity is allowed before the first prompt, as in real Pi startup.
  writeFileSync(join(evidence, `${process.pid}.startup`), 'native startup resource');
  out({ type: 'tool_execution_start', toolCallId: 'startup-resource', toolName: 'fixture', args: {} });
  out({ type: 'tool_execution_end', toolCallId: 'startup-resource', toolName: 'fixture', isError: false,
    result: { content: [{ type: 'text', text: 'startup resource ran' }] } });
  const reader = createInterface({ input: process.stdin });
  reader.on('close', () => process.exit(0));
  reader.on('line', line => {
    try { handle(JSON.parse(line)); }
    catch { writeFileSync(healthFile, 'failed'); process.exit(1); }
  });
} catch { writeFileSync(healthFile, 'failed'); process.exit(1); }
