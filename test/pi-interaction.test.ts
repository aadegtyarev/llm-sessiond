import assert from 'node:assert/strict';
import test from 'node:test';
import { SessionCore, type CoreEvent } from '../src/core.ts';
import { fixture, boundary, message, settled } from './pi-support.ts';
import { dialogs, tools, notifications, answers } from './pi-interaction-records.ts';

// Exercise the actual Core -> adapter -> child wire, not a substitute reply client.
test('pi-interaction: startup notifications, tool IDs, three explicit public replies and settlement', async t => {
  const f = await fixture(t, ['--startup-status']);
  const core = new SessionCore(f.port);
  const events: CoreEvent[] = [];
  core.subscribe(event => events.push(event));
  core.create('s'); await core.start('s');
  assert.ok(events.some(e => e.type === 'notification' && e.method === 'setStatus' && e.statusText === 'loading'));
  await core.send('s', 'i', JSON.stringify({ records: [boundary, ...tools, ...notifications, ...dialogs],
    uiExpected: 3, uiFinal: [message('stop'), settled()] }));
  assert.equal(core.get('s').input?.status, 'pending');
  const questions = events.filter(e => e.type === 'question');
  assert.deepEqual(questions.map(e => e.question.requestId), dialogs.map(d => d.id));
  for (const answer of answers) assert.deepEqual(await core.reply('s', answer), { kind: 'written' });
  await f.until(() => core.get('s').input?.status === 'completed', 'replies consumed then settled');
  const text = events.filter(e => e.type === 'text').map(e => e.text).join('');
  assert.deepEqual(JSON.parse(text).map((reply: { id: string }) => reply.id), dialogs.map(d => d.id));
  assert.deepEqual(events.filter(e => e.type === 'tool').map(e => [e.phase, e.toolCallId]),
    [['start', 'tool-id'], ['update', 'tool-id'], ['end', 'tool-id']]);
  assert.ok(events.some(e => e.type === 'notification' && e.method === 'setStatus' && !('statusText' in e)));
  assert.ok(events.some(e => e.type === 'notification' && e.method === 'notify' && e.level === 'info'));
  assert.deepEqual(await core.stop('s'), { sessionId: 's', status: 'stopped', input: { inputId: 'i', status: 'completed' } });
  await core.shutdown(); await f.closed(); f.assertHealthy();
});

test('pi-interaction: request/session ownership, no replay and cleanup during unanswered questions', async t => {
  const f = await fixture(t);
  const core = new SessionCore(f.port);
  core.create('a'); core.create('b'); await core.start('a'); await core.start('b');
  await core.send('a', 'i', JSON.stringify({ records: [boundary, ...dialogs] }));
  assert.deepEqual(await core.reply('b', answers[0]), { kind: 'rejected' });
  await core.send('b', 'i', JSON.stringify({ records: [boundary, ...dialogs] }));
  // The same native IDs in distinct owned sessions remain independent.
  assert.deepEqual(await core.reply('b', answers[0]), { kind: 'written' });
  assert.deepEqual(await core.reply('a', answers[0]), { kind: 'written' });
  assert.deepEqual(await core.reply('a', answers[0]), { kind: 'rejected' });
  const stopped = await core.stop('a');
  assert.equal(stopped.status, 'stopped');
  assert.equal(stopped.input?.status, 'unknown');
  await assert.rejects(core.reply('a', answers[1]), { code: 'invalid-state' });
  await core.shutdown(); await f.closed(); f.assertHealthy();
});

for (const loss of [{ eof: true }, { exit: true }]) {
  test(`pi-interaction: channel loss invalidates questions ${JSON.stringify(loss)}`, async t => {
    const f = await fixture(t);
    const core = new SessionCore(f.port);
    core.create('s'); await core.start('s');
    await core.send('s', 'i', JSON.stringify({ records: [boundary, ...dialogs], ...loss }));
    await f.until(() => core.get('s').input?.status === 'unknown', 'channel loss');
    assert.deepEqual(await core.reply('s', answers[0]), { kind: 'unknown' });
    await core.stop('s'); await core.shutdown(); f.assertHealthy();
  });
}
