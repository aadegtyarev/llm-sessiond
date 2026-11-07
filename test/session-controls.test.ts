import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SessionCore, CoreError } from '../src/core.ts';
import { nativeFixture } from './native-support.ts';
import type { ControlResult, NativeModel, HarnessPort, HarnessControlResult, SessionSettings, HarnessEvent } from '../src/types.ts';

const value: SessionSettings = { model: { provider: 'fixture', id: 'one' },
  thinkingLevel: 'low', availableThinkingLevels: ['off', 'low'] };
const confirmed = { kind: 'confirmed' as const, value };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
async function setup(extra: Partial<HarnessPort> = {}) {
  let emit!: (event: HarnessEvent) => void;
  const core = new SessionCore({
    async start(_id, callback) { emit = callback; return { kind: 'confirmed' }; },
    async send() { return { kind: 'confirmed' }; },
    async stop() { return { kind: 'confirmed' }; },
    async settings() { return confirmed; }, async models() { return { kind: 'confirmed', value: [value.model!] }; },
    async setModel() { return confirmed; }, async setThinkingLevel() { return confirmed; },
    async reload() { return confirmed; }, ...extra,
  });
  core.create('s'); await core.start('s');
  return { core, emit: (event: HarnessEvent) => emit(event) };
}
const invalid = (error: unknown) => error instanceof CoreError && error.code === 'invalid-state';

for (const name of ['models', 'settings', 'setModel', 'setThinkingLevel', 'reload'] as const) {
  test(`session-controls: ${name} reserves synchronously through result; stop remains available`, async () => {
    const gate = deferred<HarnessControlResult<SessionSettings>>();
    const catalogue = deferred<ControlResult<readonly NativeModel[]>>();
    let calls = 0;
    const settings = () => { calls++; return gate.promise; };
    const { core } = await setup({ models: () => { calls++; return catalogue.promise; },
      settings, setModel: settings, setThinkingLevel: settings, reload: settings });
    const task = name === 'setModel' ? core.setModel('s', { provider: 'fixture', modelId: 'one' })
      : name === 'setThinkingLevel' ? core.setThinkingLevel('s', 'low') : core[name]('s');
    assert.equal(calls, 1);
    if (name === 'models' || name === 'settings') {
      assert.deepEqual(await core.send('s', 'allowed', ''), { inputId: 'allowed', status: 'pending' });
      assert.deepEqual(await core.reply('s', { requestId: 'q', method: 'confirm', confirmed: true }), { kind: 'rejected' });
    } else {
      await assert.rejects(core.send('s', 'blocked', ''), invalid);
      await assert.rejects(core.reply('s', { requestId: 'q', method: 'confirm', confirmed: true }), invalid);
    }
    await assert.rejects(core.settings('s'), invalid);
    await assert.rejects(core.reload('s'), invalid);
    assert.equal((await core.stop('s')).status, 'stopped');
    gate.resolve(confirmed); catalogue.resolve({ kind: 'confirmed', value: [value.model!] });
    assert.deepEqual(await task, { kind: 'unknown' });
    assert.equal(core.get('s').status, 'stopped');
    await core.shutdown();
  });
}

for (const operation of ['setModel', 'setThinkingLevel', 'reload'] as const) {
  for (const outcome of ['pending', 'unknown'] as const) {
    test(`session-controls: ${operation} rejects current-generation ${outcome} input`, async () => {
      let calls = 0;
      const { core } = await setup({
        async send() { return { kind: outcome === 'pending' ? 'confirmed' : 'unknown' }; },
        [operation]: async () => { calls++; return confirmed; },
      });
      await core.send('s', 'i', '');
      const task = operation === 'setModel' ? core.setModel('s', { provider: 'fixture', modelId: 'one' })
        : operation === 'setThinkingLevel' ? core.setThinkingLevel('s', 'low') : core.reload('s');
      await assert.rejects(task, error => error instanceof CoreError && error.code === 'input-in-flight');
      assert.equal(calls, 0);
      assert.equal((await core.settings('s')).kind, 'confirmed');
      await core.shutdown();
    });
  }
}

for (const operation of ['setModel', 'setThinkingLevel', 'reload'] as const) {
  for (const result of [
    { kind: 'rejected' as const }, { kind: 'unknown' as const },
    { kind: 'unknown' as const, effectUncertain: true as const }, 'throw' as const,
  ]) {
    test(`session-controls: ${operation} ${JSON.stringify(result)} distinguishes effects from pre-effect failure`, async () => {
      const { core } = await setup({ [operation]: async () => {
        if (result === 'throw') throw new Error('private');
        return result;
      } });
      const task = operation === 'setModel' ? core.setModel('s', { provider: 'fixture', modelId: 'one' })
        : operation === 'setThinkingLevel' ? core.setThinkingLevel('s', 'low') : core.reload('s');
      assert.deepEqual(await task, { kind: result === 'throw' ? 'unknown' : result.kind });
      if (result === 'throw' || 'effectUncertain' in result) {
        assert.equal(core.get('s').status, 'unknown');
        await assert.rejects(core.send('s', 'blocked', ''), invalid);
      } else assert.equal((await core.send('s', 'allowed', '')).status, 'pending');
      assert.equal((await core.stop('s')).status, 'stopped');
      await core.shutdown();
    });
  }
}

for (const active of ['send', 'cancel', 'reply'] as const) {
  test(`session-controls: ${active} command must drain even after an early natural terminal`, async () => {
    const gate = deferred<{ kind: 'confirmed' }>();
    const ui = deferred<{ kind: 'written' }>();
    const { core, emit } = await setup({
      ...(active === 'send' ? { send: () => gate.promise } : {}),
      cancel: () => gate.promise, reply: () => ui.promise,
    });
    let pending: Promise<unknown>;
    if (active === 'send') pending = core.send('s', 'A', '');
    else if (active === 'cancel') { await core.send('s', 'A', ''); pending = core.cancel('s', 'A'); }
    else pending = core.reply('s', { requestId: 'q', method: 'confirm', confirmed: true });
    if (active !== 'reply') emit({ type: 'input-completed', inputId: 'A' });
    await assert.rejects(core.reload('s'), invalid);
    await assert.rejects(core.setModel('s', { provider: 'fixture', modelId: 'one' }), invalid);
    await assert.rejects(core.setThinkingLevel('s', 'low'), invalid);
    await assert.rejects(core.settings('s'), invalid);
    gate.resolve({ kind: 'confirmed' }); ui.resolve({ kind: 'written' });
    await pending;
    assert.equal((await core.reload('s')).kind, 'confirmed');
    if (active !== 'reply') assert.equal(core.get('s').input?.status, 'completed');
    await core.shutdown();
  });
}

test('session-controls: readonly whitelist snapshots detach port state and private fields', async () => {
  const model = { provider: 'fixture', id: 'one', name: 'One', headers: { Authorization: 'private' }, baseUrl: 'private' };
  const raw = { ...value, model, private: 'private', availableThinkingLevels: ['off', 'low'] };
  const { core } = await setup({ async settings() { return { kind: 'confirmed', value: raw }; },
    async models() { return { kind: 'confirmed', value: [model] }; } });
  const settings = await core.settings('s');
  const models = await core.models('s');
  assert.equal(settings.kind, 'confirmed'); assert.equal(models.kind, 'confirmed');
  if (settings.kind !== 'confirmed' || models.kind !== 'confirmed') throw new Error();
  assert.deepEqual(models.value, [{ provider: 'fixture', id: 'one', name: 'One' }]);
  model.id = 'changed'; raw.availableThinkingLevels.push('max');
  assert.equal(settings.value.model?.id, 'one');
  assert.deepEqual(settings.value.availableThinkingLevels, ['off', 'low']);
  for (const item of [models.value, models.value[0], settings.value, settings.value.model, settings.value.availableThinkingLevels]) {
    assert.equal(Object.isFrozen(item), true);
  }
  assert.equal(JSON.stringify([settings, models]).includes('private'), false);
  await core.shutdown();
});

test('session-controls: read-only failure does not poison sends, optional unsupported controls reject', async () => {
  const { core } = await setup({ models: undefined, reload: undefined,
    async settings() { throw new Error('private'); } });
  assert.deepEqual(await core.models('s'), { kind: 'rejected' });
  assert.deepEqual(await core.reload('s'), { kind: 'rejected' });
  assert.deepEqual(await core.settings('s'), { kind: 'unknown' });
  assert.equal((await core.send('s', 'i', '')).status, 'pending');
  await core.shutdown();
});

test('session-controls: proven stop/reopen admits controls despite OLD unknown input, retaining outcome/used IDs', async t => {
  const f = nativeFixture(t);
  Object.assign(f.port, { reload: async () => confirmed });
  f.core.create('s'); await f.core.start('s');
  f.port.sendOperation = async () => ({ kind: 'unknown' });
  await f.core.send('s', 'old', '');
  await f.core.stop('s'); await f.core.start('s');
  assert.deepEqual(f.core.get('s').input, { inputId: 'old', status: 'unknown' });
  assert.equal((await f.core.reload('s')).kind, 'confirmed');
  await assert.rejects(f.core.send('s', 'old', ''), error => error instanceof CoreError && error.code === 'duplicate-input');
  f.port.sendOperation = async () => ({ kind: 'confirmed' });
  assert.equal((await f.core.send('s', 'new', '')).status, 'pending');
  await f.core.stop('s'); await f.core.shutdown();
});

test('session-controls: late unknown after stop cannot poison a later generation', async t => {
  const f = nativeFixture(t);
  const gate = deferred<HarnessControlResult<SessionSettings>>();
  Object.assign(f.port, { reload: () => gate.promise });
  f.core.create('s'); await f.core.start('s');
  const pending = f.core.reload('s');
  await f.core.stop('s');
  await assert.rejects(f.core.start('s'), invalid); // Command must drain before reopen.
  gate.resolve({ kind: 'unknown', effectUncertain: true });
  assert.deepEqual(await pending, { kind: 'unknown' });
  await f.core.start('s');
  Object.assign(f.port, { reload: async () => confirmed });
  assert.equal((await f.core.reload('s')).kind, 'confirmed');
  assert.equal((await f.core.send('s', 'new', '')).status, 'pending');
  await f.core.stop('s'); await f.core.shutdown();
});

for (const query of ['models', 'settings'] as const) {
  for (const event of ['question', 'completed', 'cancelled'] as const) {
    test(`session-controls: ${query} permits immediate ${event} subscriber reentry`, async () => {
      const snapshot = deferred<HarnessControlResult<SessionSettings>>();
      const catalogue = deferred<ControlResult<readonly NativeModel[]>>();
      const abort = deferred<{ kind: 'confirmed' }>();
      const sends: string[] = [], replies: object[] = [];
      const { core, emit } = await setup({
        settings: () => snapshot.promise, models: () => catalogue.promise,
        async send(_id, input) { sends.push(input); return { kind: 'confirmed' }; },
        async reply(_id, answer) { replies.push(answer); return { kind: 'written' }; },
        cancel: () => abort.promise,
      });
      const first = await core.send('s', 'A', '');
      let reentry: Promise<unknown> | undefined;
      core.subscribe(observation => {
        if (event === 'question' && observation.type === 'question') {
          reentry = core.reply('s', { requestId: observation.question.requestId, method: 'confirm', confirmed: true }).catch(error => error.code);
        } else if (observation.type === 'input' && observation.input.inputId === 'A' && observation.input.status === event) {
          reentry = core.send('s', 'B', '').catch(error => error.code);
        }
      });
      const read = core[query]('s');
      await assert.rejects(core.settings('s'), invalid);
      for (const task of [core.setModel('s', { provider: 'fixture', modelId: 'one' }), core.setThinkingLevel('s', 'low'), core.reload('s')]) {
        await assert.rejects(task, invalid);
      }
      let cancelled: Promise<unknown> | undefined;
      if (event === 'cancelled') {
        cancelled = core.cancel('s', 'A').catch(error => error.code);
        emit({ type: 'input-cancelled', inputId: 'A' });
        assert.equal(reentry, undefined); // Cancel delivery/drain still owns publication.
        abort.resolve({ kind: 'confirmed' }); await cancelled;
      } else if (event === 'completed') emit({ type: 'input-completed', inputId: 'A' });
      else emit({ type: 'question', question: { requestId: 'q', method: 'confirm', title: 'Fixture', message: 'Explicit' } });
      try {
        assert.ok(reentry);
        assert.deepEqual(await reentry, event === 'question' ? { kind: 'written' } : { inputId: 'B', status: 'pending' });
        assert.deepEqual(first, { inputId: 'A', status: 'pending' });
        if (event === 'question') assert.deepEqual(replies, [{ requestId: 'q', method: 'confirm', confirmed: true }]);
        else {
          assert.deepEqual(sends, ['A', 'B']);
          if (cancelled) assert.deepEqual(await cancelled, { inputId: 'A', status: 'cancelled' });
          emit({ type: 'input-failed', inputId: 'A', certainty: 'unknown' });
          assert.deepEqual(core.get('s').input, { inputId: 'B', status: 'pending' });
        }
      } finally {
        snapshot.resolve(confirmed); catalogue.resolve({ kind: 'confirmed', value: [value.model!] });
        await read; await core.shutdown();
      }
    });
  }
}

test('session-controls: shutdown uses cleanup despite outstanding control and ignores late success', async () => {
  const gate = deferred<HarnessControlResult<SessionSettings>>();
  const { core } = await setup({ reload: () => gate.promise });
  const pending = core.reload('s');
  assert.deepEqual(await core.shutdown(), { stoppedSessionIds: ['s'], uncertainSessionIds: [], failedSessionIds: [] });
  gate.resolve(confirmed);
  assert.deepEqual(await pending, { kind: 'unknown' });
  await assert.rejects(core.settings('s'), error => error instanceof CoreError && error.code === 'closed');
});
