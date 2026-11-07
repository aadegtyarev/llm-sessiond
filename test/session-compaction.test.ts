import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SessionCore, CoreError } from '../src/core.ts';
import type { HarnessPort, HarnessControlResult } from '../src/types.ts';
import { FakePort } from './fake-port.ts';
import { nativeFixture } from './native-support.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
async function setup(compact?: HarnessPort['compact']) {
  const port = new FakePort();
  const harness: HarnessPort = {
    start: (id, emit) => port.start(id, emit), send: (...args) => port.send(...args),
    stop: (...args) => port.stop(...args), compact,
  };
  const core = new SessionCore(harness);
  core.create('s'); await core.start('s');
  return { core, port, harness };
}
const invalid = (error: unknown) => error instanceof CoreError && error.code === 'invalid-state';

for (const status of ['created', 'starting', 'stopped'] as const) {
  test(`session-compaction: ${status} is not running/idle admission`, async () => {
    const gate = deferred<{ kind: 'confirmed' }>();
    let calls = 0;
    const port: HarnessPort = { start: () => gate.promise, async send() { return { kind: 'confirmed' }; },
      async stop() { return { kind: 'confirmed' }; },
      async compact() { calls++; return { kind: 'confirmed', value: undefined }; } };
    const core = new SessionCore(port); core.create('s');
    let starting: Promise<unknown> | undefined;
    if (status !== 'created') starting = core.start('s');
    if (status === 'stopped') { gate.resolve({ kind: 'confirmed' }); await starting; await core.stop('s'); }
    await assert.rejects(core.compact('s'), invalid); assert.equal(calls, 0);
    gate.resolve({ kind: 'confirmed' }); await starting; await core.shutdown();
  });
}

for (const instructions of [undefined, '', 'Preserve the deployment facts.']) {
  test(`session-compaction: exact optional instructions ${JSON.stringify(instructions)} and private result discarded`, async () => {
    const calls: unknown[][] = [];
    const { core } = await setup(async (...args) => {
      calls.push(args);
      return { kind: 'confirmed', value: { summary: 'private', details: 'private' } } as unknown as HarnessControlResult<void>;
    });
    const result = await core.compact('s', instructions);
    assert.deepEqual(calls, [['s', instructions]]);
    assert.deepEqual(result, { kind: 'confirmed', value: undefined });
    assert.equal(Object.isFrozen(result), true);
    assert.equal(JSON.stringify(result), '{"kind":"confirmed"}');
    assert.equal((await core.send('s', 'next', 'continue')).status, 'pending');
    await core.shutdown();
  });
}

for (const result of ['unsupported', 'rejected', 'unknown', 'uncertain', 'ownership', 'throw'] as const) {
  test(`session-compaction: ${result} truthful outcome and explicit cleanup`, async () => {
    const { core } = await setup(result === 'unsupported' ? undefined : async () => {
      if (result === 'throw') throw new Error('private');
      if (result === 'uncertain') return { kind: 'unknown', effectUncertain: true };
      if (result === 'ownership') return { kind: 'unknown', ownershipLost: true };
      return { kind: result === 'rejected' ? 'rejected' : 'unknown' };
    });
    assert.deepEqual(await core.compact('s'), { kind: ['unsupported', 'rejected'].includes(result) ? 'rejected' : 'unknown' });
    if (['uncertain', 'ownership', 'throw'].includes(result)) {
      assert.equal(core.get('s').status, 'unknown');
      await assert.rejects(core.send('s', 'blocked', ''), invalid);
    } else assert.equal((await core.send('s', 'allowed', '')).status, 'pending');
    await core.stop('s'); await core.shutdown();
  });
}

for (const outcome of ['pending', 'unknown'] as const) {
  test(`session-compaction: no dispatch or hidden cancel with ${outcome} input`, async () => {
    let calls = 0;
    const { core, port } = await setup(async () => { calls++; return { kind: 'confirmed', value: undefined }; });
    port.sendOperation = async () => ({ kind: outcome === 'pending' ? 'confirmed' : 'unknown' });
    await core.send('s', 'A', '');
    await assert.rejects(core.compact('s'), error => error instanceof CoreError && error.code === 'input-in-flight');
    assert.equal(calls, 0);
    assert.equal(core.get('s').input?.status, outcome);
    await core.shutdown();
  });
}

for (const active of ['send', 'cancel', 'reply', 'query'] as const) {
  test(`session-compaction: ${active} command drain blocks compaction even after terminal`, async () => {
    const gate = deferred<{ kind: 'confirmed' }>();
    const ui = deferred<{ kind: 'written' }>();
    const query = deferred<HarnessControlResult<readonly []>>();
    let calls = 0;
    const { core, port, harness } = await setup(async () => { calls++; return { kind: 'confirmed', value: undefined }; });
    harness.cancel = () => gate.promise; harness.reply = () => ui.promise; harness.models = () => query.promise;
    if (active === 'send') port.sendOperation = () => gate.promise;
    let pending: Promise<unknown>;
    if (active === 'query') pending = core.models('s');
    else if (active === 'reply') pending = core.reply('s', { requestId: 'q', method: 'confirm', confirmed: true });
    else {
      if (active === 'cancel') await core.send('s', 'A', '');
      pending = active === 'send' ? core.send('s', 'A', '') : core.cancel('s', 'A');
      port.emit('s', { type: 'input-completed', inputId: 'A' });
    }
    await assert.rejects(core.compact('s'), invalid); assert.equal(calls, 0);
    gate.resolve({ kind: 'confirmed' }); ui.resolve({ kind: 'written' }); query.resolve({ kind: 'confirmed', value: [] });
    await pending;
    assert.equal((await core.compact('s')).kind, 'confirmed');
    await core.shutdown();
  });
}

for (const stop of ['stop', 'shutdown'] as const) {
  test(`session-compaction: exclusive fence, ${stop} and late result cannot resurrect session`, async () => {
    const gate = deferred<HarnessControlResult<void>>();
    const { core } = await setup(() => gate.promise);
    const pending = core.compact('s');
    await assert.rejects(core.send('s', 'blocked', ''), invalid);
    await assert.rejects(core.reply('s', { requestId: 'q', method: 'confirm', confirmed: true }), invalid);
    await assert.rejects(core.cancel('s', 'A'), invalid);
    await assert.rejects(core.compact('s'), invalid); await assert.rejects(core.models('s'), invalid);
    await assert.rejects(core.reload('s'), invalid);
    if (stop === 'stop') await core.stop('s'); else await core.shutdown();
    gate.resolve({ kind: 'confirmed', value: undefined });
    assert.deepEqual(await pending, { kind: 'unknown' });
    if (stop === 'stop') { assert.equal(core.get('s').status, 'stopped'); await core.shutdown(); }
    await assert.rejects(core.compact('s'), error => error instanceof CoreError && error.code === 'closed');
  });
}

test('session-compaction: native reopen fences late generation and permits OLD unknown input after drain', async t => {
  const f = nativeFixture(t);
  const gate = deferred<HarnessControlResult<void>>();
  Object.assign(f.port, { compact: () => gate.promise });
  f.core.create('s'); await f.core.start('s');
  f.port.sendOperation = async () => ({ kind: 'unknown' });
  await f.core.send('s', 'old', ''); await f.core.stop('s'); await f.core.start('s');
  const pending = f.core.compact('s');
  await f.core.stop('s'); await assert.rejects(f.core.start('s'), invalid);
  gate.resolve({ kind: 'unknown', effectUncertain: true });
  assert.deepEqual(await pending, { kind: 'unknown' });
  await f.core.start('s');
  Object.assign(f.port, { compact: async () => ({ kind: 'confirmed', value: undefined }) });
  assert.equal((await f.core.compact('s')).kind, 'confirmed');
  assert.deepEqual(f.core.get('s').input, { inputId: 'old', status: 'unknown' });
  await f.core.stop('s'); await f.core.shutdown();
});
