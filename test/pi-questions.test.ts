import assert from 'node:assert/strict';
import test from 'node:test';
import { createPiQuestions } from '../src/pi-questions.ts';
import { dialogs, answers } from './pi-interaction-records.ts';
import type { HarnessEvent, QuestionReply, ReplyOutcome } from '../src/types.ts';
import { deferred } from './fake-port.ts';

function setup() {
  const events: HarnessEvent[] = [];
  const writes: object[] = [];
  const questions = createPiQuestions(event => events.push(event), async record => {
    writes.push(record); return { kind: 'written' };
  });
  dialogs.forEach(questions.event);
  return { questions, events, writes };
}

test('pi-questions: three concurrent IDs, method/value validation and no replay', async () => {
  const { questions, writes } = setup();
  for (const answer of answers) assert.deepEqual(await questions.reply(answer), { kind: 'written' });
  for (const answer of answers) assert.deepEqual(await questions.reply(answer), { kind: 'rejected' });
  assert.deepEqual(writes, [
    { type: 'extension_ui_response', id: 'confirm-id', confirmed: true },
    { type: 'extension_ui_response', id: 'select-id', value: 'blue' },
    { type: 'extension_ui_response', id: 'input-id', value: 'hello' },
  ]);
});

for (const method of ['confirm', 'select', 'input'] as const) {
  test(`pi-questions: explicit cancellation ${method}`, async () => {
    const { questions, writes } = setup();
    const requestId = `${method}-id`;
    assert.deepEqual(await questions.reply({ requestId, method, cancelled: true }), { kind: 'written' });
    assert.deepEqual(writes, [{ type: 'extension_ui_response', id: requestId, cancelled: true }]);
    assert.deepEqual(await questions.reply({ requestId, method, cancelled: true }), { kind: 'rejected' });
  });
}

for (const answer of [
  { ...answers[0], requestId: 'unknown' },
  { requestId: 'select-id', method: 'input', value: 'blue' },
  { ...answers[1], value: 'not-an-option' },
  { ...answers[0], confirmed: 'true' },
  { ...answers[0], cancelled: true },
  { ...answers[2], value: null },
]) {
  test(`pi-questions: reject invalid answer without consuming request ${JSON.stringify(answer)}`, async () => {
    const { questions, writes } = setup();
    assert.deepEqual(await questions.reply(answer as QuestionReply), { kind: 'rejected' });
    assert.equal(writes.length, 0);
    assert.deepEqual(await questions.reply(answers[0]), { kind: 'written' });
  });
}

for (const invalidation of ['expiry', 'duplicate', 'malformed-duplicate', 'loss'] as const) {
  test(`pi-questions: ${invalidation} cannot target another request`, async () => {
    const { questions, writes } = setup();
    if (invalidation === 'expiry') {
      questions.event({ ...dialogs[0], id: 'expired', timeout: 1 });
      await new Promise(resolve => setTimeout(resolve, 5));
    } else if (invalidation === 'duplicate') questions.event(dialogs[0]);
    else if (invalidation === 'malformed-duplicate') questions.event({ ...dialogs[0], title: null });
    else questions.invalidate();
    const answer = invalidation === 'expiry' ? { ...answers[0], requestId: 'expired' } : answers[0];
    assert.deepEqual(await questions.reply(answer), { kind: 'unknown' });
    assert.equal(writes.length, 0);
    if (invalidation !== 'loss') assert.deepEqual(await questions.reply(answers[1]), { kind: 'written' });
  });
}

test('pi-questions: consumer cannot mutate stored select options or request method', async () => {
  const { questions, events } = setup();
  const request = events.find(event => event.type === 'question' && event.question.method === 'select');
  assert.ok(request?.type === 'question' && request.question.method === 'select');
  const options = request.question.options;
  assert.throws(() => (options as string[]).push('forged'));
  assert.throws(() => Object.assign(request.question, { method: 'input' }));
  assert.deepEqual(await questions.reply({ ...answers[1], value: 'forged' }), { kind: 'rejected' });
  assert.deepEqual(await questions.reply(answers[1]), { kind: 'written' });
});

test('pi-questions: claim synchronously, write uncertainty does not permit retry', async () => {
  const pending = deferred<ReplyOutcome>();
  let writes = 0;
  const questions = createPiQuestions(() => {}, async () => { writes++; return pending.promise; });
  questions.event(dialogs[0]);
  const first = questions.reply(answers[0]);
  assert.deepEqual(await questions.reply(answers[0]), { kind: 'rejected' });
  pending.resolve({ kind: 'unknown' });
  assert.deepEqual(await first, { kind: 'unknown' });
  assert.deepEqual(await questions.reply(answers[0]), { kind: 'rejected' });
  assert.equal(writes, 1);
});

test('pi-questions: written replies need a later correlated idle barrier, never replay old UI IDs', async () => {
  const { questions } = setup();
  assert.equal(questions.controlAdmissible, false);
  assert.equal(questions.quiescent, false);
  const tooEarly = questions.barrier();
  for (const answer of answers) await questions.reply(answer);
  assert.equal(questions.controlAdmissible, true);
  tooEarly();
  assert.equal(questions.quiescent, false);
  questions.barrier()();
  assert.equal(questions.quiescent, true);
  for (const answer of answers) assert.deepEqual(await questions.reply(answer), { kind: 'rejected' });
  questions.event({ ...dialogs[0], id: 'new-question' });
  assert.equal(questions.controlAdmissible, false); assert.equal(questions.quiescent, false);
});

for (const fault of ['duplicate', 'lost', 'new-question', 'malformed', 'editor', 'unknown-write'] as const) {
  test(`pi-questions: idle barrier does not erase ${fault}`, async () => {
    const questions = createPiQuestions(() => {}, async () => ({ kind: fault === 'unknown-write' ? 'unknown' : 'written' }));
    questions.event(dialogs[0]);
    await questions.reply(answers[0]);
    const prove = questions.barrier();
    if (fault === 'duplicate') questions.event(dialogs[0]);
    if (fault === 'lost') questions.invalidate();
    if (fault === 'new-question') questions.event({ ...dialogs[0], id: 'new' });
    if (fault === 'malformed') questions.event({ ...dialogs[0], id: 'new', title: null });
    if (fault === 'editor') questions.event({ type: 'extension_ui_request', id: 'editor', method: 'editor' });
    prove();
    assert.equal(questions.controlAdmissible, false);
    assert.equal(questions.quiescent, false);
  });
}
