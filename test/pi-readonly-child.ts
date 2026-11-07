// Causal RPC peer only; no provider/native SDK or user history access.
import { createInterface } from 'node:readline';
import { afterConsumption, phase } from './pi-child-control.ts';
import { message, settled } from './pi-records.ts';

const query = process.argv[2];
const action = process.argv[3];
const foreign = process.argv.includes('--foreign');
const foreignInQuery = process.argv.includes('--foreign-in-query');
const output = (record: unknown) => process.stdout.write(JSON.stringify(record) + '\n');
let reads = 0, queryDone = false, active = false, second = false;
let first: Record<string, unknown> | undefined;
const model = () => ({ provider: 'fixture', id: second ? 'two' : 'one', headers: { private: 'secret' } });
const state = () => ({ sessionId: String(process.pid), isStreaming: active, isCompacting: false,
  pendingMessageCount: 0, messageCount: 1, model: model(), thinkingLevel: second ? 'high' : 'low' });
const reader = createInterface({ input: process.stdin });
reader.on('close', () => process.exit(0));
reader.on('line', line => {
  try { handle(JSON.parse(line)); }
  catch { phase('fixture-failed'); process.exit(1); }
});
function foreignResponse(command: Record<string, unknown>) {
  process.stdout.write(JSON.stringify({ type: 'response', command: 'get_state', id: command.id, success: true,
    data: { ...state(), sessionId: 'OTHER' } }) + '\n' + JSON.stringify({ type: 'message_update',
    assistantMessageEvent: { type: 'text_delta', delta: 'foreign-must-not-forward' } }) + '\n');
  phase('foreign');
}
function holdQuery(response: () => void) {
  phase('query-held');
  afterConsumption('event', () => {
    if (action === 'question') output({ type: 'extension_ui_request', id: 'q', method: 'confirm', title: 'Fixture', message: 'Explicit reply' });
    if (action === 'completed') { active = false; output(message('stop')); output(settled(false)); }
    phase('event-published');
  });
  afterConsumption('query-result', () => { queryDone = true; response(); phase('query-result'); });
}
function handle(command: Record<string, unknown>) {
  const response = (data: unknown) => output({ type: 'response', command: command.type, id: command.id, success: true, data });
  if (command.type === 'get_state' && ++reads === 1) { response(state()); phase('ready'); return; }
  if (command.type === 'extension_ui_response') {
    if (command.id !== 'q' || command.confirmed !== true || Object.keys(command).length !== 3) throw new Error();
    phase('ui-confirmed'); return;
  }
  if (command.type === 'prompt') {
    if (command.message !== 'A' && command.message !== 'B') throw new Error();
    if (command.message === 'A') first = command;
    else second = true;
    phase(`prompt:${command.message}`);
    response({ disposition: 'started' }); active = true;
    output({ type: 'agent_start' });
    output({ type: 'tool_execution_start', toolCallId: `${command.message}-ready`, toolName: 'fixture', args: {} });
    if (second) {
      phase('B-started');
      if (!first) throw new Error();
      output({ type: 'response', command: 'prompt', id: first.id, success: false }); // Late A cannot claim B.
      phase('late-A');
      afterConsumption('B-terminal', () => { active = false; output(message('stop')); output(settled(false)); });
    } else phase('A-started');
    return;
  }
  if (command.type === 'abort') {
    if (!active || second) throw new Error();
    phase('abort'); active = false; output(settled(true)); phase('abort-settled');
    afterConsumption('abort-ack', () => {
      response(undefined);
      output({ type: 'extension_ui_request', id: 'abort-marker', method: 'notify', message: 'abort-ack-observed' });
      phase('abort-ack');
    });
    return;
  }
  if (command.type === 'get_state' && foreignInQuery && !queryDone) {
    holdQuery(() => foreignResponse(command)); return;
  }
  if (command.type === 'get_state' && foreign && queryDone) { foreignResponse(command); return; }
  if (command.type === 'get_state') { response(state()); return; }
  if (command.type !== 'get_available_models' && command.type !== 'get_available_thinking_levels') throw new Error();
  const data = () => command.type === 'get_available_models' ? { models: [model()] }
    : { levels: second ? ['off', 'low', 'high'] : ['off', 'low'] };
  const held = !queryDone && command.type === (query === 'models' ? 'get_available_models' : 'get_available_thinking_levels');
  if (!held) { response(data()); return; }
  holdQuery(() => response(data()));
}
