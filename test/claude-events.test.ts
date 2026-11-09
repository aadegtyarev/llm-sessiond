import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClaudeEvents } from '../src/claude-events.ts';
import type { HarnessEvent } from '../src/types.ts';

function display() {
  const events: HarnessEvent[] = [];
  return { events, ...createClaudeEvents(event => events.push(event)) };
}
const stream = (event: Record<string, unknown>) => ({ type: 'stream_event', event,
  session_id: 'native-history-not-local', parent_tool_use_id: null });

test('claude events: only stream text_delta, no final assistant duplicate or private frames', () => {
  const f = display();
  for (const record of [
    { type: 'system', subtype: 'init', private: 'configuration' },
    { type: 'private_unknown', text: 'private' },
    stream({ type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'private' } }),
    stream({ type: 'content_block_delta', delta: { type: 'signature_delta', signature: 'private' } }),
    { type: 'assistant', message: { content: [{ type: 'text', text: 'final duplicate' }] } },
    stream({ type: 'content_block_delta', delta: { type: 'text_delta', text: '🙂 actual text' } }),
  ]) f.event(record);
  assert.deepEqual(f.events, [{ type: 'text', text: '🙂 actual text' }]);
});

test('claude events: full permission/cancellation/results are product native records without narrowing', () => {
  const f = display();
  const records = [
    { type: 'control_request', request_id: 'native-permission', request: { subtype: 'can_use_tool',
      tool_name: 'Read', tool_use_id: 'tool-native', input: { paths: ['one', 'two'], nested: { x: false } },
      permission_suggestions: [{ type: 'addRules', rules: [{ toolName: 'Read', ruleContent: '**' }] }],
      blocked_path: '/operator/path', future: { rich: true } } },
    { type: 'control_cancel_request', request_id: 'native-permission', future: [1] },
    { type: 'result', session_id: 'history-a', subtype: 'success', is_error: false,
      usage: { input_tokens: 1 }, modelUsage: { native: { costUSD: 0.01 } }, result: 'whole', future: [1] },
    { type: 'result', session_id: 'history-b', subtype: 'error_during_execution', is_error: true,
      errors: ['actual native error'], usage: { output_tokens: 2 }, future: { preserved: true } },
  ];
  for (const record of records) f.event(record);
  assert.deepEqual(f.events, records.map(record => ({ type: 'native-record', record })));
});

test('claude events: genuine tool IDs, partial args and execution result; block stop/result do not settle background tool', () => {
  const f = display();
  f.event(stream({ type: 'content_block_start', index: 4,
    content_block: { type: 'tool_use', id: 'native-tool', name: 'Read', input: {} } }));
  f.event(stream({ type: 'content_block_delta', index: 4,
    delta: { type: 'input_json_delta', partial_json: '{"paths":' } }));
  f.event(stream({ type: 'content_block_delta', index: 4,
    delta: { type: 'input_json_delta', partial_json: '["one","two"]}' } }));
  f.event(stream({ type: 'content_block_stop', index: 4 }));
  f.event({ type: 'assistant', message: { content: [
    { type: 'tool_use', id: 'native-tool', name: 'Read', input: { paths: ['one', 'two'] }, private: 'not display' },
  ] } });
  f.event({ type: 'result', subtype: 'success', is_error: false });
  assert.equal(f.events.some(event => event.type === 'tool' && event.phase === 'end'), false);
  f.event({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'native-tool',
    content: [{ type: 'text', text: 'native tool error' }], is_error: true, private: 'not display' }] } });
  assert.deepEqual(f.events.filter(event => event.type === 'tool'), [
    { type: 'tool', phase: 'start', toolCallId: 'native-tool', toolName: 'Read', args: {} },
    { type: 'tool', phase: 'update', toolCallId: 'native-tool', toolName: 'Read', args: {}, partialResult: '{"paths":' },
    { type: 'tool', phase: 'update', toolCallId: 'native-tool', toolName: 'Read', args: { paths: ['one', 'two'] }, partialResult: '{"paths":["one","two"]}' },
    { type: 'tool', phase: 'update', toolCallId: 'native-tool', toolName: 'Read', args: { paths: ['one', 'two'] }, partialResult: { paths: ['one', 'two'] } },
    { type: 'tool', phase: 'end', toolCallId: 'native-tool', toolName: 'Read', result: [{ type: 'text', text: 'native tool error' }], isError: true },
  ]);
});

test('claude events: final tool_use works without partials; parallel IDs, message indexes and loss isolated', () => {
  const f = display();
  for (const id of ['one', 'two']) f.event({ type: 'assistant', message: { content: [
    { type: 'tool_use', id, name: 'Read', input: { id } },
  ] } });
  f.event(stream({ type: 'message_start', message: { id: 'new-native-message' } }));
  f.event(stream({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{}' } }));
  f.event({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'two', content: 'ok' }] } });
  assert.deepEqual(f.events.at(-1), { type: 'tool', phase: 'end', toolCallId: 'two', toolName: 'Read', result: 'ok', isError: false });
  f.clear();
  f.event({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'one', content: 'late' }] } });
  assert.equal(f.events.filter(event => event.type === 'tool' && event.phase === 'end').length, 1);
});

for (const block of [
  { type: 'tool_use', id: 3, name: 'Read', input: {} },
  { type: 'tool_use', id: 'id', name: 3, input: {} },
  { type: 'tool_use', id: 'id', name: 'Read', input: [] },
  { type: 'tool_result', tool_use_id: 'unseen', content: 'no invented name' },
  { type: 'thinking', thinking: 'not display' },
]) {
  test(`claude events: no fabricated tool phase for ${JSON.stringify(block)}`, () => {
    const f = display();
    f.event({ type: 'assistant', message: { content: [block] } });
    f.event({ type: 'user', message: { content: [block] } });
    assert.deepEqual(f.events, []);
  });
}
