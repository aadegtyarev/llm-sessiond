import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPiControls } from '../src/pi-controls.ts';
import { createPiWire, type RecordValue } from '../src/pi-wire.ts';
import { reloadExtensionPath } from '../src/pi-process.ts';
import { RELOAD_DESCRIPTION } from '../src/pi-reload-extension.ts';

const commandName = 'llm-sessiond-reload-00000000-0000-0000-0000-000000000000';
function peer() {
  let state: RecordValue = { sessionId: 'native', sessionFile: '/owned', isStreaming: false,
    isCompacting: false, pendingMessageCount: 0, messageCount: 3,
    model: { provider: 'fixture', id: 'one', name: 'One', headers: { private: 'secret' } }, thinkingLevel: 'low' };
  let levels = ['off', 'low'];
  let commands: unknown[] = [{ name: commandName, description: RELOAD_DESCRIPTION, source: 'extension',
    sourceInfo: { path: reloadExtensionPath, source: 'cli', scope: 'temporary', origin: 'top-level' } }];
  const calls: { type: string; data: RecordValue }[] = [];
  let broken = false, idle = true, questionsQuiescent = true, ready = true, uncertainty = 0;
  let hook: ((type: string, data: RecordValue) => Promise<RecordValue | null | undefined>) | undefined;
  const wire = { get broken() { return broken; }, async command(type: string, data: RecordValue = {}, ack?: (record: RecordValue) => void) {
    const respond = (record: RecordValue | null) => { if (record) ack?.(record); return record; };
    calls.push({ type, data });
    const overridden = await hook?.(type, data);
    if (overridden !== undefined) return respond(overridden);
    if (type === 'set_model') { state = { ...state, model: { provider: data.provider, id: data.modelId }, thinkingLevel: 'off' }; levels = ['off']; }
    if (type === 'set_thinking_level') state = { ...state, thinkingLevel: data.level };
    return respond({ success: true, data: type === 'get_state' ? state : type === 'get_available_models'
      ? { models: [state.model, { provider: 'fixture', id: 'two' }] } : type === 'get_available_thinking_levels'
      ? { levels } : type === 'get_commands' ? { commands } : type === 'prompt' ? { disposition: 'handled' } : {} });
  } } as ReturnType<typeof createPiWire>;
  const controls = createPiControls({ wire, get ready() { return ready; }, get idle() { return idle; },
    get questionsAdmissible() { return questionsQuiescent; }, get questionsQuiescent() { return questionsQuiescent; }, questionBarrier: () => () => {}, identity: () => ({ sessionId: 'native', sessionFile: '/owned' }),
    uncertain() { uncertainty++; idle = false; },
    lostOwnership() { uncertainty++; idle = false; broken = true; } }, commandName);
  return { controls, calls, get state() { return state; }, get uncertainty() { return uncertainty; },
    setState(patch: RecordValue) { state = { ...state, ...patch }; }, setCommands(value: unknown[]) { commands = value; },
    setLevels(value: string[]) { levels = value; }, hook(value: typeof hook) { hook = value; },
    setBusy(value: { idle?: boolean; questions?: boolean; ready?: boolean; broken?: boolean }) {
      idle = value.idle ?? idle; questionsQuiescent = value.questions ?? questionsQuiescent;
      ready = value.ready ?? ready; broken = value.broken ?? broken;
    } };
}

test('pi-controls: catalogue whitelist/current-model levels/native clamp and actual settings', async () => {
  const p = peer();
  assert.deepEqual(await p.controls.models(), { kind: 'confirmed', value: [
    { provider: 'fixture', id: 'one', name: 'One' }, { provider: 'fixture', id: 'two' },
  ] });
  const initial = await p.controls.settings();
  assert.equal(initial.kind, 'confirmed');
  p.setLevels(['off', 'low', 'high']);
  const effort = await p.controls.setThinkingLevel('high');
  assert.equal(effort.kind, 'confirmed');
  assert.equal(p.state.thinkingLevel, 'high');
  const model = await p.controls.setModel({ provider: 'fixture', modelId: 'two' });
  assert.deepEqual(model, { kind: 'confirmed', value: { model: { provider: 'fixture', id: 'two' },
    thinkingLevel: 'off', availableThinkingLevels: ['off'] } });
  assert.equal(p.calls.some(call => 'persist' in call.data), false);
  assert.equal(p.calls.filter(call => call.type === 'set_model').length, 1);
  assert.equal(p.calls.filter(call => call.type === 'set_thinking_level').length, 1);
  const count = p.calls.length;
  assert.deepEqual(await p.controls.setThinkingLevel('low'), { kind: 'rejected' });
  assert.equal(p.calls.slice(count).some(call => call.type.startsWith('set_')), false);
  assert.deepEqual(await p.controls.setModel({ provider: 'fixture', modelId: 'missing' }), { kind: 'rejected' });
});

test('pi-controls: genuine private invocation requires completed handled plus authoritative readback', async () => {
  const p = peer();
  assert.equal((await p.controls.reload()).kind, 'confirmed');
  assert.deepEqual(p.calls.map(call => call.type), ['get_state', 'get_available_thinking_levels', 'get_commands',
    'prompt', 'get_state', 'get_available_thinking_levels', 'get_commands']);
  assert.deepEqual(p.calls.find(call => call.type === 'prompt')?.data, { message: `/${commandName}` });
  assert.equal(p.uncertainty, 0);
});

for (const [index, commands] of [[], [{}], [{ name: commandName }],
  ...['name', 'description', 'source'].map(key => [{ name: commandName, description: RELOAD_DESCRIPTION,
    source: 'extension', sourceInfo: { path: reloadExtensionPath, source: 'cli', scope: 'temporary', origin: 'top-level' }, [key]: 'wrong' }]),
  ...['path', 'source', 'scope', 'origin'].map(key => [{ name: commandName, description: RELOAD_DESCRIPTION,
    source: 'extension', sourceInfo: { path: reloadExtensionPath, source: 'cli', scope: 'temporary', origin: 'top-level', [key]: 'wrong' } }]),
].entries()) {
  test(`pi-controls: missing/malformed/mismatched helper case ${index} never prompts`, async () => {
    const p = peer(); p.setCommands(commands);
    assert.deepEqual(await p.controls.reload(), { kind: 'rejected' });
    assert.equal(p.calls.some(call => call.type === 'prompt'), false);
    assert.equal(p.uncertainty, 0);
  });
}

for (const patch of [{ isStreaming: true }, { isCompacting: true }, { pendingMessageCount: 1 }]) {
  for (const operation of ['reload', 'model', 'effort']) {
    test(`pi-controls: ${operation} rejects native busy ${JSON.stringify(patch)} before effects`, async () => {
      const p = peer(); p.setState(patch);
      const result = operation === 'reload' ? await p.controls.reload() : operation === 'model'
        ? await p.controls.setModel({ provider: 'fixture', modelId: 'two' }) : await p.controls.setThinkingLevel('off');
      assert.deepEqual(result, { kind: 'rejected' });
      assert.equal(p.calls.some(call => call.type === 'prompt' || call.type.startsWith('set_')), false);
    });
  }
}
for (const busy of [{ idle: false }, { questions: false }, { ready: false }, { broken: true }]) {
  test(`pi-controls: owned runtime/UI fence ${JSON.stringify(busy)} avoids dispatch`, async () => {
    const p = peer(); p.setBusy(busy);
    assert.notEqual((await p.controls.reload()).kind, 'confirmed');
    assert.deepEqual(p.calls, []);
  });
}

for (const operation of ['reload', 'set_model', 'set_thinking_level']) {
  for (const fault of ['rejected', 'lost', 'throw', 'model-mismatch', 'effort-mismatch', 'identity', 'path',
    'streaming', 'compacting', 'queued', 'malformed-levels', 'extension-error', 'resource-error', 'activity']) {
    test(`pi-controls: ${operation} post-dispatch ${fault} is unknown and fail-closed`, async () => {
      const p = peer(); let dispatched = false;
      p.hook(async type => {
        if (type === (operation === 'reload' ? 'prompt' : operation)) {
          dispatched = true;
          if (fault === 'rejected') return { success: false };
          if (fault === 'lost') return null;
          if (fault === 'throw') throw new Error('private');
          if (fault === 'extension-error' || fault === 'resource-error') p.controls.event({ type: 'extension_error',
            extensionPath: fault === 'extension-error' ? `command:${commandName}` : '/private/plugin', event: 'command', error: 'private' });
          if (fault === 'activity') p.controls.event({ type: 'agent_start' });
          if (operation === 'reload') return { success: true, data: { disposition: 'handled' } };
        }
        if (dispatched && type === 'get_state') {
          const patches: Record<string, RecordValue> = {
            'model-mismatch': { model: { provider: 'other', id: 'other' } },
            'effort-mismatch': { thinkingLevel: 'other' }, identity: { sessionId: 'other' }, path: { sessionFile: '/other' },
            streaming: { isStreaming: true }, compacting: { isCompacting: true }, queued: { pendingMessageCount: 2 },
          };
          p.setState(patches[fault] ?? {});
        }
        if (dispatched && fault === 'malformed-levels' && type === 'get_available_thinking_levels') return { success: true, data: { levels: ['wrong'] } };
        return undefined;
      });
      const result = operation === 'reload' ? await p.controls.reload() : operation === 'set_model'
        ? await p.controls.setModel({ provider: 'fixture', modelId: 'two' }) : await p.controls.setThinkingLevel('off');
      assert.equal(dispatched, true);
      const lostIdentity = fault === 'identity' || fault === 'path';
      assert.deepEqual(result, lostIdentity ? { kind: 'unknown', ownershipLost: true } : { kind: 'unknown', effectUncertain: true });
      assert.equal(p.uncertainty, 1);
      const before = p.calls.length;
      assert.deepEqual(await p.controls.reload(), lostIdentity ? { kind: 'unknown', ownershipLost: true } : { kind: 'rejected' });
      assert.equal(p.calls.length, before);
    });
  }
}
for (const disposition of ['started', 'queued', undefined]) {
  test(`pi-controls: reload ${disposition} is not completion`, async () => {
    const p = peer(); p.hook(async type => type === 'prompt' ? { success: true, data: { disposition } } : undefined);
    assert.deepEqual(await p.controls.reload(), { kind: 'unknown', effectUncertain: true });
  });
}

test('pi-controls: duplicate helper provenance and post-reload helper loss cannot claim success', async () => {
  const p = peer();
  p.hook(async type => {
    if (type === 'get_commands') return { success: true, data: { commands: [{ name: commandName }, { name: commandName }] } };
    return undefined;
  });
  assert.deepEqual(await p.controls.reload(), { kind: 'rejected' });
  assert.equal(p.calls.some(call => call.type === 'prompt'), false);
  const after = peer();
  after.hook(async type => { if (type === 'prompt') after.setCommands([]); return undefined; });
  assert.deepEqual(await after.controls.reload(), { kind: 'unknown', effectUncertain: true });
});

for (const query of ['get_state', 'get_available_thinking_levels', 'get_available_models']) {
  test(`pi-controls: failed ${query} pre-effect query does not invent effect uncertainty`, async () => {
    const p = peer(); p.hook(async type => type === query ? { success: false } : undefined);
    const result = query === 'get_available_models' ? await p.controls.setModel({ provider: 'fixture', modelId: 'two' })
      : await p.controls.setThinkingLevel('off');
    assert.deepEqual(result, { kind: 'unknown' });
    assert.equal(p.uncertainty, 0);
    assert.equal(p.calls.some(call => call.type.startsWith('set_')), false);
  });
}
for (const event of [{ type: 'agent_start' }, { type: 'auto_compaction_start' },
  { type: 'extension_ui_request', method: 'confirm' }, { type: 'extension_error' }]) {
  test(`pi-controls: observed ${event.type}/${event.method ?? ''} during preflight prevents dispatch`, async () => {
    const p = peer(); p.hook(async type => { if (type === 'get_commands') p.controls.event(event); return undefined; });
    assert.deepEqual(await p.controls.reload(), { kind: 'rejected' });
    assert.equal(p.calls.some(call => call.type === 'prompt'), false); assert.equal(p.uncertainty, 0);
  });
}

test('pi-controls: snapshots are detached/readonly and absent selected model is honest null', async () => {
  const p = peer();
  const result = await p.controls.settings();
  assert.equal(result.kind, 'confirmed'); if (result.kind !== 'confirmed') throw new Error();
  p.setState({ model: null });
  assert.equal(result.value.model?.id, 'one');
  assert.equal(Object.isFrozen(result.value.model), true);
  assert.equal(Object.isFrozen(result.value.availableThinkingLevels), true);
  assert.equal(JSON.stringify(result).includes('secret'), false);
  const absent = await p.controls.settings();
  assert.equal(absent.kind, 'confirmed'); if (absent.kind !== 'confirmed') throw new Error();
  assert.equal(absent.value.model, null);
});

for (const extra of ['notify', 'setStatus', 'append-context']) {
  test(`pi-controls: benign ${extra} during native reload preserves completion`, async () => {
    const p = peer();
    p.hook(async type => {
      if (type === 'prompt') {
        if (extra === 'append-context') p.setState({ messageCount: 4 });
        else p.controls.event({ type: 'extension_ui_request', method: extra });
      }
      return undefined;
    });
    assert.equal((await p.controls.reload()).kind, 'confirmed');
    assert.equal(p.uncertainty, 0);
  });
}

test('pi-controls: context count loss cannot be reported as preservation', async () => {
  const p = peer(); p.hook(async type => { if (type === 'prompt') p.setState({ messageCount: 2 }); return undefined; });
  assert.deepEqual(await p.controls.reload(), { kind: 'unknown', effectUncertain: true });
});

for (const query of ['models', 'settings'] as const) {
  for (const change of ['ordinary', 'agent_settled', 'thinking_level_changed', 'model_select']) {
    test(`pi-controls: ${query} ${change} overlap discards mixed snapshot without poisoning`, async () => {
      const p = peer();
      let release!: (response: RecordValue) => void;
      const held = new Promise<RecordValue>(resolve => { release = resolve; });
      const before = { ...p.state };
      p.hook(async type => type === (query === 'models' ? 'get_available_models' : 'get_state') ? held : undefined);
      const read = p.controls[query]();
      assert.equal(p.controls.busy, true); assert.equal(p.controls.exclusive, false);
      if (change === 'ordinary') p.controls.beginOrdinary();
      else p.controls.event({ type: change });
      p.setState({ model: { provider: 'fixture', id: 'two' }, thinkingLevel: 'high' });
      p.setLevels(['off', 'low', 'high']); // Old low is still valid: validation alone cannot detect the mixed snapshot.
      if (change === 'ordinary') p.controls.endOrdinary();
      release({ success: true, data: query === 'models' ? { models: [before.model] } : before });
      assert.deepEqual(await read, { kind: 'unknown' }); assert.equal(p.uncertainty, 0);
      p.hook(undefined);
      const fresh = await p.controls.settings(); assert.equal(fresh.kind, 'confirmed');
      if (fresh.kind !== 'confirmed') throw new Error();
      assert.equal(fresh.value.model?.id, 'two'); assert.equal(fresh.value.thinkingLevel, 'high');
    });
  }
}

test('pi-controls: ordinary command drain excludes every mutator even when run is idle', async () => {
  const p = peer(); p.controls.beginOrdinary();
  assert.deepEqual(await p.controls.setModel({ provider: 'fixture', modelId: 'two' }), { kind: 'rejected' });
  assert.deepEqual(await p.controls.setThinkingLevel('off'), { kind: 'rejected' });
  assert.deepEqual(await p.controls.reload(), { kind: 'rejected' });
  assert.deepEqual(p.calls, []);
  p.controls.endOrdinary();
  assert.equal((await p.controls.setThinkingLevel('off')).kind, 'confirmed');
});

test('pi-controls: expected effectful thinking readback event is not a conflicting readonly boundary', async () => {
  const p = peer(); p.hook(async type => {
    if (type === 'set_thinking_level') p.controls.event({ type: 'thinking_level_changed', level: 'off' });
    return undefined;
  });
  assert.equal((await p.controls.setThinkingLevel('off')).kind, 'confirmed'); assert.equal(p.uncertainty, 0);
});

test('pi-controls: read-only failure remains distinct and overlapping commands cannot dispatch', async () => {
  const p = peer();
  let release!: (value: RecordValue) => void;
  const gate = new Promise<RecordValue>(resolve => { release = resolve; });
  p.hook(async type => type === 'get_state' ? gate : undefined);
  const pending = p.controls.settings();
  assert.equal(p.controls.busy, true);
  assert.deepEqual(await p.controls.models(), { kind: 'rejected' });
  assert.deepEqual(await p.controls.settings(), { kind: 'rejected' });
  assert.deepEqual(await p.controls.reload(), { kind: 'rejected' });
  assert.equal(p.calls.length, 1);
  release({ success: false });
  assert.deepEqual(await pending, { kind: 'unknown' });
  assert.equal(p.uncertainty, 0); assert.equal(p.controls.busy, false);
});
