// TEST ONLY: an owned Node stream-json peer, never a native CLI/provider.
import { createInterface } from 'node:readline';
import { appendFileSync } from 'node:fs';
const [ledger, label] = process.argv.slice(2);
const note = event => appendFileSync(ledger, JSON.stringify({ label, pid: process.pid, event }) + '\n');
const send = record => process.stdout.write(JSON.stringify(record) + '\n');
const held = [];
const users = [];
const answers = [];
let initialized;
let resultCount = 0;
note('spawn');
process.once('SIGTERM', () => process.exit(0));
const lines = createInterface({ input: process.stdin });
lines.once('close', () => process.exit(0));
const answer = (record, response = {}, subtype = 'success') => send({
  type: 'control_response', response: { subtype, request_id: record.request_id,
    ...(subtype === 'error' ? { error: 'fake native error', details: ['whole', false] } : { response }),
    future: { usage: { input_tokens: 7 }, opaque: [1, false] } }, metadata: { native: 'fake-only' },
});
const permission = {
  type: 'control_request', request_id: 'permission-native', session_id: 'pi.local',
  request: { subtype: 'can_use_tool', tool_name: 'Read', tool_use_id: 'native-tool',
    input: { paths: ['🙂/one', 'two'], nested: { allow: false, options: [1, null] } },
    permission_suggestions: [{ type: 'addRules', rules: [{ toolName: 'Read', ruleContent: 'docs/**' }], behavior: 'allow', destination: 'session' }],
    blocked_path: '🙂/one', decision_reason: 'explicit operator required', future: { preserve: true } },
  future: { requestMetadata: ['untouched'] },
};
function turn() {
  // Genuine native field shapes; fake data, no claimed user/result correlation.
  for (const delta of ['🙂 При', 'вет\u2028']) send({ type: 'stream_event', session_id: 'pi.local',
    parent_tool_use_id: null, event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: delta } } });
  send({ type: 'stream_event', event: { type: 'content_block_delta', index: 0,
    delta: { type: 'thinking_delta', thinking: 'private-thinking-must-not-display' } } });
  send({ type: 'system', subtype: 'private', diagnostic: 'private-system-must-not-display' });
  process.stderr.write('private-stderr-must-not-display\n');
  send({ type: 'assistant', session_id: 'pi.local', message: { content: [
    { type: 'text', text: 'final-text-must-not-duplicate' },
    { type: 'tool_use', id: 'native-tool', name: 'Read', input: { paths: ['🙂/one'], nested: [false, 3] } },
  ] } });
  send({ type: 'user', session_id: 'pi.local', message: { role: 'user', content: [
    { type: 'tool_result', tool_use_id: 'native-tool', content: [{ type: 'text', text: 'tool-native-output' }], is_error: false },
  ] } });
  send({ type: 'result', subtype: 'success', is_error: false, result: 'whole native 🙂 result',
    session_id: 'pi.local', uuid: 'native-result-id', usage: { input_tokens: 11, output_tokens: 5 },
    modelUsage: { fake_model: { costUSD: 0 } }, total_cost_usd: 0,
    duration_ms: 12, duration_api_ms: 7, num_turns: 1, future: { metadata: [false, { native: 'kept' }] } });
  send({ type: 'result', subtype: 'error_during_execution', is_error: true, errors: ['fake native failure', 'whole details'],
    session_id: 'pi.local', uuid: 'native-error-id', usage: { input_tokens: 13, output_tokens: 0 }, future: { details: [2] } });
  send({ type: 'control_cancel_request', request_id: 'permission-native', future: { reason: 'fake cancellation' } });
  resultCount += 2;
}
lines.on('line', line => {
  const record = JSON.parse(line);
  if (record.type === 'user') { users.push(record); if (users.length === 1) send(permission); return; }
  if (record.type === 'control_response') {
    answers.push(record);
    send({ type: 'result', subtype: 'success', is_error: false, session_id: 'pi.local', echoedAnswer: record });
    return;
  }
  if (record.type !== 'control_request') return;
  const subtype = record.request.subtype;
  if (subtype === 'initialize') { initialized = record; answer(record, { fixtureReady: true }); return; }
  if (subtype === 'fixture_hold') {
    held.push(record);
    send({ type: 'result', subtype: 'success', is_error: false, fixtureHeld: record.request_id }); return;
  }
  if (subtype === 'fixture_release') for (const pending of held.splice(0).reverse()) {
    note(`control-response:${pending.request_id}`); answer(pending, { original: pending });
  }
  if (subtype === 'fixture_turn') turn();
  if (subtype === 'inspect') {
    answer(record, { pid: process.pid, argv: process.argv.slice(2), cwd: process.cwd(), initialized,
      users, answers, pending: held.map(value => value.request_id), resultCount,
      credentialInEnv: Object.values(process.env).some(value => value?.includes('integration_')) });
  } else answer(record, { original: record }, subtype === 'fixture_native_error' ? 'error' : 'success');
});
