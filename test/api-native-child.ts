// Fake Native Pi wire peer; no model/provider. File evidence belongs to the test.
import { createInterface } from 'node:readline';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dialogs } from './pi-interaction-records.ts';
import { message, settled } from './pi-records.ts';

const root = process.argv[2];
const out = (record: unknown) => process.stdout.write(JSON.stringify(record) + '\n');
const text = (delta: string) => out({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta } });
const complete = () => { out(message('stop')); out(settled()); };
const consumed: Record<string, unknown>[] = [];
let phase = 'startup';
let turn = 0;
const reader = createInterface({ input: process.stdin });
reader.on('close', () => process.exit(0));
reader.on('line', line => {
  try { handle(JSON.parse(line)); }
  catch { writeFileSync(join(root, 'health'), 'fixture-failed'); process.exit(1); }
});
function handle(command: Record<string, unknown>) {
  if (command.type === 'get_state') {
    out({ type: 'response', id: command.id, command: 'get_state', success: true,
      data: { isStreaming: false, sessionId: String(process.pid) } });
    return;
  }
  if (command.type === 'extension_ui_response') {
    consumed.push(command);
    if (consumed.length === 3) finishReplies();
    return;
  }
  if (command.type !== 'prompt') throw new Error('unexpected command');
  out({ type: 'response', id: command.id, command: 'prompt', success: true, data: { disposition: 'started' } });
  out({ type: 'agent_start' });
  if (++turn === 1) { text('fixture:clarify: choose fixture-blue'); complete(); return; }
  if (turn !== 2 || command.message !== 'fixture-blue') throw new Error('unexpected answer');
  phase = 'questions';
  const bytes = 'fixture-owned-bytes\n';
  out({ type: 'tool_execution_start', toolCallId: 'disk', toolName: 'write', args: { path: 'owned.txt' } });
  writeFileSync(join(root, 'owned.txt'), bytes);
  const actual = readFileSync(join(root, 'owned.txt'), 'utf8');
  out({ type: 'tool_execution_end', toolCallId: 'disk', toolName: 'write', isError: false,
    result: { content: [{ type: 'text', text: actual }] } });
  out({ type: 'extension_ui_request', id: 'status', method: 'setStatus', statusKey: 'fixture', statusText: 'questions' });
  dialogs.forEach(out);
}
function finishReplies() {
  if (phase !== 'questions') throw new Error('unexpected replies');
  const tuple = consumed.map(reply => ({ id: reply.id, value: reply.confirmed ?? reply.value }));
  out({ type: 'tool_execution_end', toolCallId: 'consumed', toolName: 'fixture', isError: false,
    result: { content: [{ type: 'text', text: JSON.stringify(tuple) }] } });
  writeFileSync(join(root, 'health'), 'healthy');
  text('fixture:completed'); complete();
}
