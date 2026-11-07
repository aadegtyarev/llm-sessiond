// Portable external-process smoke, identical on Linux and Windows. No Core/TS imports.
import assert from 'node:assert/strict';
import { smokeDaemon } from './smoke-daemon.mjs';
import { translatorSessionSmoke } from './translator-session-smoke.mjs';

const api = await smokeDaemon();
let stream;
try {
  stream = await api.stream();
  for (const sessionId of ['external', 'other']) {
    await api.request('/sessions', { sessionId });
    assert.equal((await api.request(`/sessions/${sessionId}/start`, {})).status, 'running');
  }
  const state = await api.request('/sessions/external/command', { type: 'get_state' });
  const other = await api.request('/sessions/other/command', { type: 'get_state' });
  assert.notEqual(state.data.pid, other.data.pid);
  assert.deepEqual(state.data.argv, ['--mode', 'rpc']);
  assert.equal(state.data.packageDir, null);
  const command = { type: 'prompt', message: 'fixture-blue', streamingBehavior: 'followUp', observations: true };
  const response = await api.request('/sessions/external/command', command);
  assert.deepEqual(response.data.received, { ...command, id: response.id });
  assert.equal(response.type, 'response'); assert.equal(response.command, 'prompt');
  assert.deepEqual(response.optionalMetadata, { fixture: true });
  const text = await stream.next(f => f.event === 'core' && f.data.type === 'text');
  assert.equal(text.data.text, '🙂 fixture text');
  assert.equal(text.data.sessionId, 'external');
  for (const method of ['confirm', 'select', 'input']) {
    await stream.next(f => f.event === 'core' && f.data.type === 'question' && f.data.question.method === method);
  }
  const tools = stream.events.filter(f => f.event === 'core' && f.data.type === 'tool');
  assert.equal(tools.length, 3);
  const toolBase = { type: 'tool', sessionId: 'external', toolCallId: 'tool-id', toolName: 'fixture' };
  assert.deepEqual(tools.map(f => f.data), [
    { ...toolBase, phase: 'start', args: { nested: ['x'] } },
    { ...toolBase, phase: 'update', args: {}, partialResult: { content: ['partial'] } },
    { ...toolBase, phase: 'end', result: { content: ['final'] }, isError: false, durationMs: 3 },
  ]);
  assert.deepEqual(stream.events.filter(f => f.event === 'core' && f.data.type === 'notification').map(f => f.data), [
    { type: 'notification', sessionId: 'external', method: 'setStatus', statusKey: 'fixture', statusText: 'waiting' },
    { type: 'notification', sessionId: 'external', method: 'setStatus', statusKey: 'fixture' },
    { type: 'notification', sessionId: 'external', method: 'notify', message: 'benign', level: 'info' },
  ]);
  const replies = [
    { requestId: 'confirm-id', method: 'confirm', confirmed: true },
    { requestId: 'select-id', method: 'select', value: 'blue' },
    { requestId: 'input-id', method: 'input', value: 'hello' },
  ];
  await api.request('/sessions/other/reply', replies[0]).then(v => assert.equal(v.kind, 'rejected'));
  for (const reply of replies) {
    assert.deepEqual(await api.request('/sessions/external/reply', reply), { kind: 'written' });
    const frame = await stream.next(f => f.event === 'core' && f.data.type === 'tool'
      && f.data.toolCallId === 'reply' && f.data.result.id === reply.requestId);
    const expected = { type: 'extension_ui_response', id: reply.requestId };
    if (reply.method === 'confirm') expected.confirmed = reply.confirmed; else expected.value = reply.value;
    assert.deepEqual(frame.data.result, expected);
  }
  let compactDone = false;
  const compact = api.request('/sessions/external/compact', { customInstructions: 'hold' });
  void compact.then(() => { compactDone = true; });
  await stream.next(f => f.event === 'core' && f.data.type === 'tool' && f.data.toolCallId === 'compact-pending');
  const independent = await api.request('/sessions/other/command', { type: 'prompt', message: 'other connection' });
  assert.equal(independent.data.pid, other.data.pid);
  assert.equal((await api.request('/sessions/external/command', { type: 'abort' })).command, 'abort');
  assert.deepEqual(await api.request('/sessions/external/reply', { requestId: 'confirm-id', method: 'confirm', cancelled: true }), { kind: 'written' });
  assert.equal(compactDone, false);
  await api.request('/sessions/external/command', { type: 'fixture_release_compact' });
  const compactResponse = await compact;
  assert.deepEqual(compactResponse, { type: 'response', id: compactResponse.id, command: 'compact', success: true,
    optionalMetadata: { fixture: true }, data: { summary: 'whole summary', firstKeptEntryId: 'abc',
      tokensBefore: 150000, estimatedTokensAfter: 123, usage: { input: 2 }, details: { opaque: [1] },
      received: { id: compactResponse.id, type: 'compact', customInstructions: 'hold' } } });
  const refused = await api.request('/sessions/external/command', { type: 'prompt', refuse: true });
  assert.deepEqual(refused, { type: 'response', id: refused.id, command: 'prompt', success: false,
    error: 'native refusal', optionalMetadata: { busy: true }, details: ['whole'] });
  await api.request('/sessions/external/stop', {});
  assert.deepEqual(await api.request('/shutdown', {}), { stoppedSessionIds: ['other'], uncertainSessionIds: [], failedSessionIds: [] });
  await api.exited();
  assert.equal(JSON.stringify(stream.events).includes(api.token), false);
  assert.equal(JSON.stringify(stream.events).includes('private'), false);
  console.log(JSON.stringify({ smoke: 'passed', platform: process.platform, events: stream.events.length,
    scope: 'independent connections, full responses, tool/text/question/notification, no-ACK replies, concurrent compact/abort' }));
} finally {
  if (stream) await stream.close();
  await api.cleanup();
}
await translatorSessionSmoke();
