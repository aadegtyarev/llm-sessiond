// Node-only Pi RPC double. Never loads Pi, providers, auth, or saved histories.
import { createInterface } from 'node:readline';
import { dialogs, tools, notifications } from './pi-interaction-records.ts';

const send = (record: object) => process.stdout.write(JSON.stringify(record) + '\n');
const lines = createInterface({ input: process.stdin });
let startup: Record<string, unknown> | undefined;
const heldCompactions: (() => void)[] = [];
lines.on('line', line => {
  const command = JSON.parse(line);
  if (command.type === 'extension_ui_response') {
    send({ type: 'tool_execution_end', toolCallId: 'reply', toolName: 'fixture',
      result: command, isError: false });
    if (startup) { respond(startup, {}); startup = undefined; }
    return; // Native UI replies have no RPC response.
  }
  if (command.type === 'get_state') {
    if (process.argv.includes('--fixture-readiness-loss')) { process.stdout.end(); return; }
    if (process.argv.includes('--fixture-readiness-refusal')) {
      send({ type: 'response', id: command.id, command: 'get_state', success: false, error: 'private readiness failure' }); return;
    }
    if (process.argv.includes('--fixture-readiness-malformed')) { respond(command, null); return; }
    if (process.argv.includes('--fixture-readiness-held')) {
      send({ type: 'extension_ui_request', method: 'notify', message: 'readiness-held' }); return;
    }
    if (process.argv.includes('--fixture-startup-question')) { startup = command; send(dialogs[0]); return; }
    respond(command, { isStreaming: true, pendingMessageCount: 7, pid: process.pid,
      argv: process.argv.slice(2), cwd: process.cwd(), packageDir: process.env.PI_PACKAGE_DIR ?? null });
    return;
  }
  dispatch(command);
});
function respond(command: Record<string, unknown>, data: unknown) {
  send({ type: 'response', id: command.id, command: command.type, success: true, data,
    optionalMetadata: { fixture: true } });
}
function dispatch(command: Record<string, unknown>) {
  process.stderr.write('private fixture diagnostics\n');
  if (command.type === 'fixture_release_compact') {
    for (const finish of heldCompactions.splice(0)) finish();
    respond(command, {}); return;
  }
  if (command.type === 'fixture_loss') { process.stdout.end(); return; }
  if (command.type === 'fixture_exit') { process.exit(0); }
  if (command.observations) {
    for (const record of [...tools, ...dialogs, ...notifications]) send(record);
    send({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: '🙂 fixture text' } });
    send({ type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: 'private thinking' } });
    for (const type of ['agent_start', 'agent_end', 'agent_settled']) send({ type });
  }
  if (command.type === 'compact') {
    send({ type: 'tool_execution_start', toolCallId: 'compact-pending', toolName: 'fixture', args: {} });
  }
  const finish = () => {
    if (command.refuse) {
      send({ type: 'response', id: command.id, command: command.type, success: false,
        error: 'native refusal', optionalMetadata: { busy: true }, details: ['whole'] });
      return;
    }
    respond(command, command.type === 'compact'
      ? { summary: 'whole summary', firstKeptEntryId: 'abc', tokensBefore: 150000,
        estimatedTokensAfter: 123, usage: { input: 2 }, details: { opaque: [1] }, received: command }
      : { disposition: command.disposition ?? 'started', received: command, pid: process.pid });
  };
  if (command.type === 'compact' && command.customInstructions === 'hold') { heldCompactions.push(finish); return; }
  const delay = Number(command.delayMs ?? 0);
  if (delay > 0) setTimeout(finish, delay); else finish();
}
