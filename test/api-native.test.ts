import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apiFixture } from './api-support.ts';
import { fixture, boundary, message, settled } from './pi-support.ts';
import { dialogs, answers } from './pi-interaction-records.ts';

test('daemon native reply IDs/method/options/session/duplicates are not interchangeable', async t => {
  const native = await fixture(t);
  const api = await apiFixture(t, native.port);
  const stream = await api.stream();
  await api.running('a'); await api.running('b');
  await api.request('/sessions/a/send', { inputId: 'i', text: JSON.stringify({
    records: [boundary, ...dialogs], uiExpected: 3, uiFinal: [message('stop'), settled()],
  }) });
  await stream.next(f => f.event === 'core' && f.data.type === 'question' && f.data.question.method === 'input');
  for (const [id, answer] of [
    ['b', answers[0]], ['a', { ...answers[0], requestId: 'wrong' }],
    ['a', { requestId: 'confirm-id', method: 'input', value: 'wrong-method' }],
    ['a', { ...answers[1], value: 'wrong-option' }],
  ] as const) assert.deepEqual(await api.request(`/sessions/${id}/reply`, answer), { kind: 'rejected' });
  const outcomes = await Promise.all(answers.map(answer => api.request('/sessions/a/reply', answer)));
  assert.deepEqual(outcomes, answers.map(() => ({ kind: 'written' })));
  assert.deepEqual(await api.request('/sessions/a/reply', answers[0]), { kind: 'rejected' });
  await stream.next(f => f.event === 'core' && f.data.type === 'input' && f.data.input.status === 'completed');
  const consumed = await stream.next(f => f.event === 'core' && f.data.type === 'text' && f.data.text.includes('extension_ui_response'));
  assert.equal(consumed.event, 'core');
  assert.equal((await api.request('/sessions/b')).input, null);
  await stream.close();
});

test('daemon native duplicate questions and channel loss remain unknown, not success', async t => {
  const native = await fixture(t);
  const api = await apiFixture(t, native.port);
  const stream = await api.stream();
  await api.running();
  await api.request('/sessions/s/send', { inputId: 'i', text: JSON.stringify({
    records: [boundary, dialogs[0], dialogs[0]],
  }) });
  assert.deepEqual(await api.request('/sessions/s/reply', answers[0]), { kind: 'unknown' });
  await api.request('/sessions/s/send', { inputId: 'blocked', text: '{}' }, 409);
  assert.equal((await api.request('/sessions/s/stop', {})).status, 'stopped');
  await api.running('lost');
  await api.request('/sessions/lost/send', { inputId: 'loss', text: JSON.stringify({ records: [boundary], eof: true }) });
  await stream.next(f => f.event === 'core' && f.data.type === 'input' && f.data.sessionId === 'lost' && f.data.input.status === 'unknown');
  assert.equal((await api.request('/sessions/lost')).input.status, 'unknown');
  await api.request('/sessions/lost/send', { inputId: 'after-loss', text: '{}' }, 409);
  assert.equal((await api.request('/sessions/lost/stop', {})).status, 'stopped');
  await stream.close();
});
