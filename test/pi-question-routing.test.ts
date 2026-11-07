import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPiQuestions } from '../src/pi-questions.ts';
import type { RecordValue } from '../src/pi-wire.ts';
import { dialogs, answers } from './pi-interaction-records.ts';

test('pi question routing: original concurrent IDs/methods and exact no-ACK UI frames', async () => {
  const frames: RecordValue[] = [];
  const router = createPiQuestions(() => {}, async record => { frames.push(record); return { kind: 'written' }; });
  for (const dialog of dialogs) router.event(dialog);
  for (const answer of answers) assert.deepEqual(await router.reply(answer), { kind: 'written' });
  assert.deepEqual(frames, [
    { type: 'extension_ui_response', id: 'confirm-id', confirmed: true },
    { type: 'extension_ui_response', id: 'select-id', value: 'blue' },
    { type: 'extension_ui_response', id: 'input-id', value: 'hello' },
  ]);
  assert.deepEqual(await router.reply({ requestId: 'unknown', method: 'input', value: 'x' }), { kind: 'rejected' });
  assert.deepEqual(await router.reply({ requestId: 'select-id', method: 'confirm', confirmed: true }), { kind: 'rejected' });
  assert.equal(frames.length, 3);
});

test('pi question routing: no wrapper expiry/options/consumption engine; immediate reentry and opaque IDs', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const requestId = 'q'.repeat(1025);
  const frames: RecordValue[] = [];
  let immediate: Promise<unknown> | undefined;
  const router = createPiQuestions(event => {
    if (event.type === 'question') immediate = router.reply({ requestId, method: 'select', value: 'Native decides options' });
  }, async frame => { frames.push(frame); return { kind: 'written' }; });
  router.event({ type: 'extension_ui_request', id: requestId, method: 'select', title: 'choose', options: ['blue'], timeout: 1 });
  assert.deepEqual(await immediate, { kind: 'written' });
  t.mock.timers.tick(60_000);
  assert.deepEqual(await router.reply({ requestId, method: 'select', cancelled: true }), { kind: 'written' });
  assert.deepEqual(frames, [
    { type: 'extension_ui_response', id: requestId, value: 'Native decides options' },
    { type: 'extension_ui_response', id: requestId, cancelled: true },
  ]);
  router.invalidate();
  assert.deepEqual(await router.reply({ requestId, method: 'select', value: 'blue' }), { kind: 'unknown' });
  assert.equal(frames.length, 2);
});
