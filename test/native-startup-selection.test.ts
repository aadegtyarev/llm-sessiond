import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { nativeHeader } from './native-support.ts';
import { nativeIdentity } from '../src/native-history.ts';
import { nativeStartupSelection, pinNativeStartup } from '../src/native-startup.ts';
import { restoreNativeSettings } from '../src/pi-startup.ts';
import type { NativeBinding } from '../src/types.ts';
import type { RecordValue, createPiWire } from '../src/pi-wire.ts';

function history(t: TestContext, version: number, entries: RecordValue[]) {
  const root = mkdtempSync(join(tmpdir(), 'native-prefix-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = join(root, 'owned.jsonl');
  const header = { ...JSON.parse(nativeHeader(undefined, root)), version };
  const bytes = [header, ...entries].map(entry => JSON.stringify(entry)).join('\n') + '\n';
  writeFileSync(file, bytes);
  const binding: NativeBinding = { file, cwd: root, nativeId: header.id, identity: nativeIdentity(file), fresh: false };
  pinNativeStartup(binding);
  return { binding, bytes };
}
const change = (id: string, parentId: string | null, modelId: string): RecordValue => ({ type: 'model_change', id, parentId, provider: 'fixture', modelId });
const effort = (id: string, parentId: string | null, thinkingLevel: string): RecordValue => ({ type: 'thinking_level_change', id, parentId, thinkingLevel });
const response = (id: string, parentId: string | null, model: string, api = 'physical'): RecordValue => ({
  type: 'message', id, parentId, message: { role: 'assistant', api, provider: 'fixture', model, content: [] },
});

for (const version of [1, 2, 3]) {
  test(`native-startup: v${version} selected branch metadata, not detached/latest model change`, t => {
    const entries = [change('a', null, 'router'), effort('b', 'a', 'high'), response('c', 'b', 'physical'),
      change('detached', null, 'unrelated'), { type: 'custom', id: 'leaf', parentId: 'c' }];
    const f = history(t, version, entries);
    const selection = nativeStartupSelection(f.binding);
    assert.deepEqual(selection, { modelChange: { provider: 'fixture', modelId: version === 1 ? 'unrelated' : 'router' },
      ...(version === 1 ? {} : { responseModel: { provider: 'fixture', modelId: 'physical' } }), thinkingLevel: 'high' });
    assert.equal(readFileSync(f.binding.file, 'utf8'), f.bytes);
  });
}

test('native-startup: exact prefix survives appended native defaults without rebasing', t => {
  const f = history(t, 3, [change('a', null, 'one'), effort('b', 'a', 'high')]);
  const original = f.binding.startupReference;
  appendFileSync(f.binding.file, JSON.stringify(change('tail', 'b', 'default')) + '\n');
  pinNativeStartup(f.binding);
  assert.equal(f.binding.startupReference, original);
  assert.deepEqual(nativeStartupSelection(f.binding), { modelChange: { provider: 'fixture', modelId: 'one' }, thinkingLevel: 'high' });
});
for (const fault of ['truncated', 'rewritten', 'corrupt-tail', 'replaced']) {
  test(`native-startup: ${fault} fails closed without repairing bytes`, t => {
    const f = history(t, 3, [change('a', null, 'one')]);
    if (fault === 'truncated') writeFileSync(f.binding.file, f.bytes.slice(0, -3));
    if (fault === 'rewritten') writeFileSync(f.binding.file, f.bytes.replace('one', 'two'));
    if (fault === 'corrupt-tail') appendFileSync(f.binding.file, '{bad}\n');
    if (fault === 'replaced') { rmSync(f.binding.file); writeFileSync(f.binding.file, f.bytes); }
    const changed = readFileSync(f.binding.file);
    assert.throws(() => pinNativeStartup(f.binding), { code: 'native-invalid' });
    assert.deepEqual(readFileSync(f.binding.file), changed);
  });
}

test('native-startup: virtual response itself is not a physical model selection', t => {
  const f = history(t, 3, [change('a', null, 'router'), response('b', 'a', 'router', 'pi-virtual')]);
  assert.deepEqual(nativeStartupSelection(f.binding), { modelChange: { provider: 'fixture', modelId: 'router' }, thinkingLevel: undefined });
});

for (const kind of ['physical', 'virtual', 'missing-virtual', 'ambiguous', 'missing-discriminator', 'response-only']) {
  test(`pi-startup: native catalogue resolves ${kind} branch semantics without cycling/fallback`, async () => {
    const calls: { type: string; data: RecordValue }[] = [];
    const router = { provider: 'fixture', id: 'router', ...(kind === 'missing-discriminator' ? {} : { api: kind === 'physical' ? 'physical' : 'pi-virtual' }) };
    const models = [{ provider: 'fixture', id: 'physical', api: 'physical' },
      ...(kind === 'missing-virtual' ? [] : [router]), ...(kind === 'ambiguous' ? [router] : [])];
    let state: RecordValue = { model: { provider: 'fixture', id: 'default' }, thinkingLevel: 'off' };
    const wire: Pick<ReturnType<typeof createPiWire>, 'command'> = { async command(type: string, data: RecordValue = {}) {
      calls.push({ type, data });
      if (type === 'set_model') state = { ...state, model: { provider: data.provider, id: data.modelId } };
      if (type === 'set_thinking_level') state = { ...state, thinkingLevel: data.level };
      return { success: true, data: type === 'get_available_models' ? { models } : { levels: ['off', 'high'] } };
    } };
    const result = await restoreNativeSettings({ ...(kind === 'response-only' ? {} : { modelChange: { provider: 'fixture', modelId: 'router' } }),
      responseModel: { provider: 'fixture', modelId: 'physical' }, thinkingLevel: 'high' },
    { wire, state: async () => state, safe: () => true });
    const invalid = kind === 'ambiguous' || kind === 'missing-discriminator' || kind === 'missing-virtual';
    assert.equal(result, !invalid);
    assert.deepEqual(calls.filter(call => call.type === 'set_model').map(call => call.data), invalid ? [] : [
      { provider: 'fixture', modelId: kind === 'virtual' ? 'router' : 'physical' },
    ]);
    assert.equal(calls.some(call => call.type === 'prompt' || call.type.startsWith('cycle_')), false);
  });
}
