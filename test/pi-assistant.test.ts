import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { HarnessEvent } from '../src/contracts.ts';
import { createPiRun } from '../src/pi-run.ts';
import { boundary, fixture, message, settled, until } from './pi-support.ts';
import { malformedAssistants } from './pi-assistant-cases.ts';

const outcomes = [['stop', false], ['error', false], ['aborted', true]] as const;
function terminal(aborted: boolean, messages: unknown[]) {
  const events: HarnessEvent[] = [];
  const run = createPiRun((event) => events.push(event));
  const owned = run.begin('i');
  assert.ok(owned);
  assert.equal(run.acknowledge(owned, { success: true, data: { disposition: 'started' } }).kind,
    'confirmed');
  run.event(boundary);
  for (const value of messages) run.event({ type: 'message_end', message: value });
  run.event(settled(aborted));
  return events;
}
const unknown = [{ type: 'input-failed', inputId: 'i', certainty: 'unknown' }];
for (const [reason, aborted] of outcomes) {
  for (const [name, malformed] of malformedAssistants(reason)) {
    for (const earlierValid of [false, true]) {
      test(`pi assistant ${reason}: ${name}; earlier valid=${earlierValid}`, () => {
        const messages: unknown[] = earlierValid ? [message(reason).message] : [];
        assert.deepEqual(terminal(aborted, [...messages, malformed]), unknown);
      });
    }
  }
}

for (const [reason, aborted] of outcomes) {
  const expected = reason === 'stop' ? [{ type: 'input-completed', inputId: 'i' }]
    : [{ type: 'input-failed', inputId: 'i', certainty: 'definitive' }];
  for (const content of [[], [{ type: 'text', text: '', textSignature: 'opaque' }],
    [{ type: 'thinking', thinking: '', redacted: true, thinkingSignature: 'opaque' }],
    [{ type: 'toolCall', id: 'call', name: 'tool', arguments: { nested: [null, true, {}] },
      thoughtSignature: 'opaque', namespace: 'native' }],
    [{ type: 'text', text: 'private' }, { type: 'thinking', thinking: 'private' },
      { type: 'toolCall', id: 'id', name: 'tool', arguments: {} }],
  ]) {
    test(`pi native content accepted ${reason}: ${JSON.stringify(content)}`, () => {
      const valid = { ...message(reason).message, content, responseModel: 'native',
        responseId: 'id', diagnostics: [], endTurn: true, durationMs: 0 };
      const usage = { ...valid.usage, reasoning: 1, cacheWrite1h: 0,
        cost: { ...valid.usage.cost, totalFromProvider: true } };
      assert.deepEqual(terminal(aborted, [{ ...valid, usage }]), expected);
    });
  }
  for (const nonAssistant of [
    { role: 'user', content: 'private', timestamp: 1 },
    { role: 'system', content: 'private', timestamp: 1 },
    { role: 'toolResult', content: [], timestamp: 1,
      toolCallId: 'id', toolName: 'tool', isError: false },
    { role: 'custom', content: 'private', timestamp: 1, customType: 'fake', display: true },
    { role: 'bashExecution', command: 'fake', output: 'private', cancelled: false,
      exitCode: 0, timestamp: 1 },
    { role: 'branchSummary', summary: 'private', fromId: 'id', timestamp: 1 },
    { role: 'compactionSummary', summary: 'private', tokensBefore: 1, timestamp: 1 },
  ]) {
    test(`pi non-assistant ${nonAssistant.role} cannot supply ${reason} evidence`, () => {
      const candidate = { ...nonAssistant, stopReason: reason };
      assert.deepEqual(terminal(aborted, [candidate]), unknown);
      assert.deepEqual(terminal(aborted, [message(reason).message, candidate]), expected);
    });
  }
  for (const earlierValid of [false, true]) {
    test(`pi fake child malformed ${reason}, earlier valid=${earlierValid}`, async (t) => {
      const f = await fixture(t);
      await f.start();
      const records = earlierValid ? [boundary, message(reason)] : [boundary];
      await f.send({ batch: true, records: [...records,
        { type: 'message_end', message: { role: 'assistant', stopReason: reason } },
        settled(aborted),
      ] });
      await until(() => f.events.length > 0);
      assert.deepEqual(f.events, unknown);
      assert.equal((await f.send({ records: [] }, 'next')).kind, 'unknown');
    });
  }
}
