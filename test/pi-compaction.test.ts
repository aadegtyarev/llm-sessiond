import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { createPiControls } from '../src/pi-controls.ts';
import { wireDouble } from './pi-wire-double.ts';
import type { RecordValue } from '../src/pi-wire.ts';

const state = { sessionId: 'owned', sessionFile: '/owned', model: { provider: 'fixture', id: 'one' },
  thinkingLevel: 'off', isStreaming: false, isCompacting: false, pendingMessageCount: 0 };
const result = { summary: 'private summary', firstKeptEntryId: 'kept', tokensBefore: 100,
  estimatedTokensAfter: 40, details: { private: 'secret' }, usage: { private: 'secret' } };
const start = { type: 'compaction_start', reason: 'manual' };
const end = { type: 'compaction_end', reason: 'manual', result, aborted: false, willRetry: false };

function fixture() {
  let controls!: ReturnType<typeof createPiControls>, uncertainty = 0;
  let ready = true, idle = true, admissible = true, quiescent = true, settleQuestions = false;
  const peer = wireDouble(500, record => controls.event(record));
  controls = createPiControls({ wire: peer.wire, get ready() { return ready; }, get idle() { return idle; },
    get questionsAdmissible() { return admissible; }, get questionsQuiescent() { return quiescent; },
    questionBarrier: () => () => { if (settleQuestions) quiescent = true; }, identity: () => state,
    uncertain() { uncertainty++; idle = false; }, lostOwnership() { uncertainty++; ready = false; peer.wire.fail(); },
  }, 'private-unused');
  let consumed = 0;
  async function frame(type: string, data?: RecordValue) {
    for (let i = 0; peer.frames.length <= consumed && i < 100; i++) await setImmediate();
    assert.equal(peer.frames.length, consumed + 1, `causal ${type} frame`);
    assert.equal(peer.frames[consumed++].type, type);
    if (data) { peer.release(); peer.respond({ data }); }
  }
  const emit = (record: object) => peer.stdout.write(JSON.stringify(record) + '\n');
  const read = async (patch: RecordValue = {}) => { await frame('get_state', { ...state, ...patch }); await frame('get_available_thinking_levels', { levels: ['off'] }); };
  return { controls, peer, frame, read, emit, get uncertainty() { return uncertainty; },
    busy(patch: { ready?: boolean; idle?: boolean; admissible?: boolean; quiescent?: boolean; settleQuestions?: boolean }) {
      ready = patch.ready ?? ready; idle = patch.idle ?? idle; admissible = patch.admissible ?? admissible;
      quiescent = patch.quiescent ?? quiescent; settleQuestions = patch.settleQuestions ?? settleQuestions;
    } };
}

for (const instructions of [undefined, '', 'Keep exact facts.']) {
  test(`pi-compaction: native manual events + RPC + idle readback; exact instructions ${JSON.stringify(instructions)}`, async t => {
    const f = fixture(); t.after(f.peer.cleanup);
    const pending = f.controls.compact(instructions);
    await f.read(); await f.frame('compact');
    const { id: _id, ...frame } = f.peer.frames.at(-1)!;
    assert.deepEqual(frame, instructions === undefined ? { type: 'compact' } : { type: 'compact', customInstructions: instructions });
    f.emit(start); f.emit(end); f.peer.respond({ data: result });
    let settled = false; void pending.then(() => { settled = true; });
    await setImmediate();
    assert.equal(settled, false); assert.equal(f.peer.frames.length, 3); // ACK does not drain the local write.
    f.peer.release(); await f.read();
    const actual = await pending;
    assert.deepEqual(actual, { kind: 'confirmed', value: undefined });
    assert.equal(JSON.stringify(actual), '{"kind":"confirmed"}');
    assert.equal(f.uncertainty, 0);
    assert.deepEqual(f.peer.frames.map(x => x.type), ['get_state', 'get_available_thinking_levels', 'compact', 'get_state', 'get_available_thinking_levels']);
  });
}

for (const busy of [{ idle: false }, { admissible: false }, { ready: false }]) {
  test(`pi-compaction: local busy ${JSON.stringify(busy)} never dispatches or aborts`, async t => {
    const f = fixture(); t.after(f.peer.cleanup); f.busy(busy);
    assert.notEqual((await f.controls.compact()).kind, 'confirmed');
    assert.deepEqual(f.peer.frames, []); assert.equal(f.uncertainty, 0);
  });
}
for (const patch of [{ isStreaming: true }, { isCompacting: true }, { pendingMessageCount: 1 }]) {
  test(`pi-compaction: native busy ${JSON.stringify(patch)} rejects before compact can implicitly abort`, async t => {
    const f = fixture(); t.after(f.peer.cleanup);
    const pending = f.controls.compact(); await f.read(patch);
    assert.deepEqual(await pending, { kind: 'rejected' });
    assert.equal(f.peer.frames.some(x => x.type === 'compact' || x.type === 'abort'), false);
    assert.equal(f.uncertainty, 0);
  });
}

test('pi-compaction: ordinary write/ACK drain is required despite local idle', async t => {
  const f = fixture(); t.after(f.peer.cleanup); f.controls.beginOrdinary();
  assert.deepEqual(await f.controls.compact(), { kind: 'rejected' }); assert.deepEqual(f.peer.frames, []);
  f.controls.endOrdinary();
  const pending = f.controls.compact(); await f.read(); await f.frame('compact');
  f.emit(start); f.emit(end); f.peer.release(); f.peer.respond({ data: result }); await f.read();
  assert.equal((await pending).kind, 'confirmed');
});

for (const settle of [false, true]) {
  test(`pi-compaction: written UI consumption needs native idle barrier, settled=${settle}`, async t => {
    const f = fixture(); t.after(f.peer.cleanup);
    f.busy({ quiescent: false, settleQuestions: settle });
    const pending = f.controls.compact(); await f.read();
    if (settle) {
      await f.frame('compact'); f.emit(start); f.emit(end); f.peer.release(); f.peer.respond({ data: result }); await f.read();
      assert.equal((await pending).kind, 'confirmed');
    } else { assert.deepEqual(await pending, { kind: 'rejected' }); assert.equal(f.peer.frames.length, 2); }
  });
}

for (const event of [{ type: 'agent_start' }, { type: 'auto_compaction_start' }, start, end,
  { type: 'extension_error' }, { type: 'extension_ui_request', method: 'confirm' }]) {
  test(`pi-compaction: preflight ${event.type} prevents dispatch without inventing uncertainty`, async t => {
    const f = fixture(); t.after(f.peer.cleanup);
    const pending = f.controls.compact();
    await f.frame('get_state', state); await f.frame('get_available_thinking_levels');
    f.emit(event); f.peer.release(); f.peer.respond({ data: { levels: ['off'] } });
    assert.deepEqual(await pending, { kind: 'rejected' }); assert.equal(f.peer.frames.length, 2); assert.equal(f.uncertainty, 0);
  });
}

const badEvents: [string, object[]][] = [
  ['ACK-only', []], ['start-only', [start]], ['end-only', [end]], ['reverse', [end, start]],
  ['duplicate-start', [start, start, end]], ['duplicate-end', [start, end, end]],
  ['automatic-reason', [{ ...start, reason: 'auto' }, end]], ['wrong-end-reason', [start, { ...end, reason: 'auto' }]],
  ['aborted', [start, { ...end, aborted: true }]], ['willRetry', [start, { ...end, willRetry: true }]],
  ['error', [start, { ...end, errorMessage: 'private failure' }]], ['missing-result', [start, { ...end, result: undefined }]],
  ...Object.entries({ summary: 1, firstKeptEntryId: '', tokensBefore: -1, estimatedTokensAfter: 'bad' })
    .map(([key, value]): [string, object[]] => [`malformed-${key}`, [start, { ...end, result: { ...result, [key]: value } }]]),
  ...[{ type: 'agent_start' }, { type: 'agent_settled' }, { type: 'auto_compaction_start' }, { type: 'auto_compaction_end' },
    { type: 'model_select' }, { type: 'thinking_level_changed' }, { type: 'extension_error', error: 'private' },
    { type: 'extension_ui_request', method: 'input' }].map((event): [string, object[]] => [event.type, [start, event, end]]),
];
for (const [fault, events] of badEvents) {
  test(`pi-compaction: dispatched ${fault} is unknown, never summary/ACK-as-confirmation`, async t => {
    const f = fixture(); t.after(f.peer.cleanup);
    const pending = f.controls.compact(); await f.read(); await f.frame('compact');
    events.forEach(f.emit); f.peer.release(); f.peer.respond({ data: result });
    // Some event combinations can pass RPC completion but fail the final activity fence.
    if (events.length >= 3 && !fault.startsWith('duplicate')) await f.read();
    assert.deepEqual(await pending, { kind: 'unknown', effectUncertain: true });
    assert.equal(f.uncertainty, 1);
  });
}

for (const fault of ['refused-empty', 'refused-small', 'refused-extension', 'wrong-command', 'wrong-id', 'write', 'eof', 'timeout', 'result-mismatch', 'late-end'] as const) {
  test(`pi-compaction: causal dispatch then ${fault} cannot claim completion or accept late success`, async t => {
    const f = fixture(); t.after(f.peer.cleanup);
    const pending = f.controls.compact(); await f.read(); await f.frame('compact');
    if (fault.startsWith('refused')) {
      f.emit(start); f.emit({ ...end, result: undefined, errorMessage: `private ${fault}`, aborted: fault === 'refused-extension' });
      f.peer.release(); f.peer.respond({ success: false, error: `private ${fault}` });
    } else if (fault === 'write') f.peer.release(new Error('private'));
    else if (fault === 'eof') f.peer.stdout.end();
    else if (fault === 'late-end') {
      f.emit(start); f.peer.release(); f.peer.respond({ data: result }); f.emit(end);
    } else if (fault !== 'timeout') {
      f.emit(start); f.emit(end); f.peer.release();
      f.peer.respond(fault === 'wrong-command' ? { command: 'get_state' } : fault === 'wrong-id' ? { id: 'other' }
        : { data: { ...result, summary: 'mismatched private summary' } });
    }
    assert.deepEqual(await pending, { kind: 'unknown', effectUncertain: true }); assert.equal(f.uncertainty, 1);
    if (fault !== 'eof') f.peer.respond({ data: result });
    const count = f.peer.frames.length;
    assert.deepEqual(await f.controls.compact(), { kind: f.peer.wire.broken ? 'unknown' : 'rejected' });
    assert.equal(f.peer.frames.length, count); // Neither uncertainty nor broken transport permits a second compact.
  });
}

for (const patch of [{ sessionId: 'foreign' }, { sessionFile: '/foreign' }, { isStreaming: true }, { isCompacting: true },
  { pendingMessageCount: 1 }, { thinkingLevel: 'high' }, { model: { provider: 'other', id: 'other' } }]) {
  test(`pi-compaction: final same-identity/settings/quiescence readback ${JSON.stringify(patch)}`, async t => {
    const f = fixture(); t.after(f.peer.cleanup);
    const pending = f.controls.compact(); await f.read(); await f.frame('compact');
    f.emit(start); f.emit(end); f.peer.release(); f.peer.respond({ data: result });
    const foreign = 'sessionId' in patch || 'sessionFile' in patch;
    await f.frame('get_state', { ...state, ...patch });
    if (!foreign) await f.frame('get_available_thinking_levels', { levels: ['off', 'high'] });
    assert.deepEqual(await pending, foreign ? { kind: 'unknown', ownershipLost: true } : { kind: 'unknown', effectUncertain: true });
    assert.equal(f.uncertainty, 1);
  });
}

for (const fault of ['failed-state', 'malformed-state', 'malformed-levels', 'foreign-identity'] as const) {
  test(`pi-compaction: preflight ${fault} never dispatches or invents an effect`, async t => {
    const f = fixture(); t.after(f.peer.cleanup);
    const pending = f.controls.compact(); await f.frame('get_state'); f.peer.release();
    f.peer.respond(fault === 'failed-state' ? { success: false } : { data: fault === 'malformed-state'
      ? {} : { ...state, ...(fault === 'foreign-identity' ? { sessionId: 'foreign' } : {}) } });
    if (fault === 'malformed-levels') await f.frame('get_available_thinking_levels', { levels: [] });
    assert.deepEqual(await pending, fault === 'foreign-identity' ? { kind: 'unknown', ownershipLost: true } : { kind: 'unknown' });
    assert.equal(f.peer.frames.some(frame => frame.type === 'compact'), false);
    assert.equal(f.uncertainty, fault === 'foreign-identity' ? 1 : 0);
  });
}

for (const fault of ['failed-state', 'malformed-levels', 'duplicate-end', 'extension-error', 'question'] as const) {
  test(`pi-compaction: completion still requires final readback without ${fault}`, async t => {
    const f = fixture(); t.after(f.peer.cleanup);
    const pending = f.controls.compact(); await f.read(); await f.frame('compact');
    f.emit(start); f.emit(end); f.peer.release(); f.peer.respond({ data: result });
    await f.frame('get_state'); f.peer.release();
    f.peer.respond(fault === 'failed-state' ? { success: false } : { data: state });
    if (fault !== 'failed-state') {
      await f.frame('get_available_thinking_levels');
      if (fault === 'duplicate-end') f.emit(end);
      if (fault === 'extension-error') f.emit({ type: 'extension_error', error: 'private late failure' });
      if (fault === 'question') f.emit({ type: 'extension_ui_request', method: 'select' });
      f.peer.release(); f.peer.respond({ data: { levels: fault === 'malformed-levels' ? [] : ['off'] } });
    }
    assert.deepEqual(await pending, { kind: 'unknown', effectUncertain: true }); assert.equal(f.uncertainty, 1);
  });
}

test('pi-compaction: reservation excludes all controls; stop/loss remains possible', async t => {
  const f = fixture(); t.after(f.peer.cleanup);
  const pending = f.controls.compact();
  assert.equal(f.controls.exclusive, true);
  for (const operation of [f.controls.models(), f.controls.settings(), f.controls.reload(), f.controls.compact()]) {
    assert.deepEqual(await operation, { kind: 'rejected' });
  }
  f.peer.wire.fail(); assert.deepEqual(await pending, { kind: 'unknown' }); // No compact was dispatched.
  assert.equal(f.uncertainty, 0);
});
