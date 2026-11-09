import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createClaudeHarness } from '../src/claude-harness.ts';
import { SessionCore } from '../src/core.ts';
import { createHarnessRegistry } from '../src/harness-registry.ts';
import type { HarnessEvent, HarnessPort, NativeRecord } from '../src/types.ts';

const fixture = fileURLToPath(new URL('./claude-fixture.mjs', import.meta.url));
const request = (subtype: string, request_id?: string) => ({ type: 'control_request',
  ...(request_id === undefined ? {} : { request_id }), request: { subtype } });
function own(t: TestContext, mode = 'normal', stopDeadlineMs = 1000) {
  const port = createClaudeHarness({ executable: process.execPath, prefixArgs: [fixture, mode], stopDeadlineMs });
  t.after(async () => { await port.stop('local'); });
  return port;
}
async function inspect(port: HarnessPort, id = 'local') {
  const answer = await port.command(id, request('inspect'));
  return (answer as { response: { response: { pid: number; argv: string[]; cwd: string; initialized: NativeRecord } } }).response.response;
}
async function waitFor<T>(read: () => T | undefined): Promise<T> {
  for (let tries = 0; tries < 400; tries++) {
    const value = read(); if (value !== undefined) return value;
    await delay(5);
  }
  throw new Error('test-only event wait exceeded');
}

test('claude harness: lazy construction, exact trusted transport argv, cwd and native initialize readiness', { timeout: 5000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'claude-fake-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const marker = join(dir, 'marker');
  const port = createClaudeHarness({ executable: process.execPath,
    prefixArgs: [fixture, 'marker', marker], cwd: dir, stopDeadlineMs: 1000 });
  t.after(() => port.stop('local'));
  await delay(75);
  await assert.rejects(access(marker));
  const events: HarnessEvent[] = [];
  assert.deepEqual(await port.start('local', event => events.push(event)), { kind: 'confirmed' });
  await access(marker);
  const observation = await inspect(port);
  assert.deepEqual(observation.argv, ['marker', marker, '-p', '--input-format', 'stream-json',
    '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--permission-prompts', 'host']);
  assert.equal(observation.cwd, dir);
  assert.deepEqual(observation.initialized, { type: 'control_request',
    request_id: observation.initialized.request_id, request: { subtype: 'initialize', hooks: null } });
  assert.equal(typeof observation.initialized.request_id, 'string');
  assert.deepEqual(events, []); // No system or stderr display.
  assert.deepEqual(await port.start('local', () => {}), { kind: 'rejected' });
  assert.deepEqual(await port.stop('local'), { kind: 'confirmed' });
});

for (const stopDeadlineMs of [0, -1, Infinity, NaN]) {
  test(`claude harness: invalid cleanup deadline ${stopDeadlineMs} rejected without spawn`, () => {
    assert.throws(() => createClaudeHarness({ executable: 'never-executed', stopDeadlineMs }), RangeError);
  });
}

for (const [mode, kind] of [['ready-error', 'rejected'], ['ready-loss', 'unknown']] as const) {
  test(`claude harness: native initialize ${mode} retains owned child for explicit cleanup`, { timeout: 5000 }, async t => {
    const port = own(t, mode);
    assert.deepEqual(await port.start('local', () => {}), { kind });
    assert.deepEqual(await port.start('local', () => {}), { kind: 'rejected' });
    assert.deepEqual(await port.stop('local'), { kind: 'confirmed' });
  });
}

test('claude harness: initialize has no wait deadline; explicit stop closes pending readiness honestly', { timeout: 5000 }, async t => {
  const port = own(t, 'ready-pending');
  let done = false;
  const start = port.start('local', () => {}); void start.then(() => { done = true; });
  await delay(100); assert.equal(done, false);
  assert.deepEqual(await port.stop('local'), { kind: 'confirmed' });
  assert.deepEqual(await start, { kind: 'unknown' });
});

test('claude harness: independent children and channels, reverse controls, native errors as full data, no user/result FIFO', { timeout: 5000 }, async t => {
  const port = own(t);
  t.after(() => port.stop('other'));
  const local: HarnessEvent[] = [], other: HarnessEvent[] = [];
  await Promise.all([port.start('local', e => local.push(e)), port.start('other', e => other.push(e))]);
  assert.notEqual((await inspect(port)).pid, (await inspect(port, 'other')).pid);
  const a = port.command('local', request('hold', 'native-a'));
  const b = port.command('local', request('hold', 'native-b'));
  const permission = { type: 'control_response', response: { subtype: 'success',
    request_id: 'permission-native', response: { behavior: 'deny', message: 'operator decision' } } };
  const writes = [{ type: 'user', message: { role: 'user', content: 'one' } },
    { type: 'user', message: { role: 'user', content: 'two' } }, permission];
  assert.deepEqual(await Promise.all(writes.map(record => port.command('local', record))), writes.map(() => ({ kind: 'written' })));
  const interrupt = await port.command('local', request('interrupt', 'explicit-interrupt'));
  assert.equal((interrupt as { response: { request_id: string } }).response.request_id, 'explicit-interrupt');
  const nativeError = await port.command('local', request('native_error'));
  assert.deepEqual((nativeError as NativeRecord).metadata, { native: true });
  assert.equal((nativeError as { response: { subtype: string } }).response.subtype, 'error');
  await port.command('local', request('release'));
  const replies = await Promise.all([a, b]);
  assert.deepEqual(replies.map(r => (r as { response: { request_id: string } }).response.request_id), ['native-a', 'native-b']);
  const result = await waitFor(() => local.find(e => e.type === 'native-record'));
  assert.deepEqual(result, { type: 'native-record', record: { type: 'result', subtype: 'success',
    is_error: false, result: 'explicit permission received', echoedAnswer: permission, session_id: 'native-history' } });
  assert.deepEqual(other, []);
  assert.deepEqual(await port.stop('local'), { kind: 'confirmed' });
  assert.equal((await inspect(port, 'other')).argv[0], 'normal');
  await assert.rejects(port.command('other', { type: 'compact' }), { code: 'harness-rejected' });
  assert.deepEqual(await port.stop('other'), { kind: 'confirmed' });
});

test('claude harness: full permission request permits immediate explicit native answer via Core; local routing ignores native IDs', { timeout: 5000 }, async t => {
  const port = own(t);
  const core = new SessionCore(createHarnessRegistry(new Map([['opaque-native', port]]), 'opaque-native'));
  t.after(async () => { await core.shutdown(); });
  core.create('local', 'opaque-native'); core.create('other', 'opaque-native');
  await Promise.all([core.start('local'), core.start('other')]);
  const permission = { type: 'control_request', request_id: 'permission-complex', session_id: 'other',
    request: { subtype: 'can_use_tool', tool_name: 'Read', tool_use_id: 'genuine-tool',
      input: { paths: ['a', 'b'], nested: { safe: false } },
      permission_suggestions: [{ type: 'addRules', rules: [{ toolName: 'Read' }] }], future: [1] } };
  const answer = { type: 'control_response', response: { subtype: 'success', request_id: permission.request_id,
    response: { behavior: 'allow', updatedInput: { paths: ['operator-selected'] }, updatedPermissions: [] } } };
  const cancellation = { type: 'control_cancel_request', request_id: permission.request_id, future: true };
  const result = { type: 'result', session_id: 'other', subtype: 'error_during_execution',
    is_error: true, errors: ['native error'], usage: { input_tokens: 3 }, modelUsage: { native: [1] }, future: [true] };
  const records: NativeRecord[] = [];
  let immediate: Promise<unknown> | undefined;
  core.subscribe(event => {
    if (event.type !== 'native-record') return;
    assert.equal(event.sessionId, 'local');
    assert.equal(Object.isFrozen(event.record), true);
    records.push(event.record);
    if (event.record.type === 'control_request') immediate = core.command('local', answer);
  });
  assert.deepEqual(await core.command('local', { type: 'fixture_emit', records: [permission, cancellation, result] }), { kind: 'written' });
  await waitFor(() => records.some(r => r.echoedAnswer !== undefined) ? true : undefined);
  assert.deepEqual(await immediate, { kind: 'written' });
  assert.deepEqual(records.filter(r => !('echoedAnswer' in r)), [permission, cancellation, result]);
  assert.deepEqual(records.find(r => 'echoedAnswer' in r)?.echoedAnswer, answer);
  assert.deepEqual(await core.reply('local', { requestId: permission.request_id, method: 'confirm', confirmed: true }), { kind: 'rejected' });
  assert.deepEqual(core.get('other'), { sessionId: 'other', status: 'running', harness: 'opaque-native' });
});

test('claude harness: native text/tools reach the bound local Core source; no private/final text duplicates', { timeout: 5000 }, async t => {
  const port = own(t);
  const core = new SessionCore(port);
  t.after(async () => { await core.shutdown(); });
  core.create('local'); await core.start('local');
  const events: HarnessEvent[] = [];
  core.subscribe(event => {
    if (event.type === 'session') return;
    assert.equal(event.sessionId, 'local');
    events.push(event);
  });
  const records = [
    { type: 'stream_event', session_id: 'unrelated-history', event: {
      type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'actual 🙂' } } },
    { type: 'stream_event', event: { type: 'content_block_delta', index: 0,
      delta: { type: 'thinking_delta', thinking: 'private' } } },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'final duplicate' },
      { type: 'tool_use', id: 'native-tool', name: 'Read', input: { path: 'file' } }] } },
    { type: 'system', text: 'private' },
    { type: 'result', is_error: false, subtype: 'success', future: 'turn-not-background-end' },
    { type: 'user', message: { content: [
      { type: 'tool_result', tool_use_id: 'native-tool', content: 'native tool output', is_error: false }] } },
    { type: 'result', is_error: true, errors: ['native full error'], marker: 'done' },
  ];
  await core.command('local', { type: 'fixture_emit', records });
  await waitFor(() => events.find(e => e.type === 'native-record' && e.record.marker === 'done'));
  assert.deepEqual(events.filter(e => e.type === 'text'), [{ type: 'text', sessionId: 'local', text: 'actual 🙂' }]);
  assert.deepEqual(events.filter(e => e.type === 'tool'), [
    { type: 'tool', sessionId: 'local', phase: 'start', toolCallId: 'native-tool', toolName: 'Read', args: { path: 'file' } },
    { type: 'tool', sessionId: 'local', phase: 'end', toolCallId: 'native-tool', toolName: 'Read', result: 'native tool output', isError: false },
  ]);
  assert.equal(JSON.stringify(events).includes('private'), false);
  const observedTool = events.find(e => e.type === 'tool' && e.phase === 'start');
  assert.equal(observedTool?.type === 'tool' && observedTool.phase === 'start' && Object.isFrozen(observedTool.args), true);
});

test('claude harness: unknown cleanup retains ownership, explicit retry uses newly observed own exit', { timeout: 5000 }, async t => {
  const port = own(t, 'ignore-term', 100);
  let pid: number | undefined;
  let confirmed = false;
  t.after(async () => {
    if (pid && !confirmed) {
      try { process.kill(pid, 'SIGKILL'); } catch { /* Already exited owned fake. */ }
      await port.stop('local');
    }
  });
  await port.start('local', () => {});
  pid = (await inspect(port)).pid;
  const pending = port.command('local', request('hold'));
  assert.deepEqual(await port.stop('local'), { kind: 'unknown' });
  assert.equal(await pending, null);
  assert.deepEqual(await port.start('local', () => {}), { kind: 'rejected' });
  await assert.rejects(port.command('local', { type: 'user' }), { code: 'harness-unknown' });
  process.kill(pid, 'SIGKILL'); // Only this test's own Node fake; never a native process.
  assert.deepEqual(await port.stop('local'), { kind: 'confirmed' });
  confirmed = true;
  assert.deepEqual(await port.stop('local'), { kind: 'confirmed' });
});

for (const operation of ['fixture_malformed', 'fixture_eof', 'fixture_exit']) {
  test(`claude harness: ${operation} loses pending answer, never manufactures native failure, cleanup stays honest`, { timeout: 5000 }, async t => {
    const port = own(t);
    const events: HarnessEvent[] = [];
    await port.start('local', e => events.push(e));
    const pending = port.command('local', request('hold'));
    assert.deepEqual(await port.command('local', { type: operation }), { kind: 'written' });
    assert.equal(await pending, null);
    await assert.rejects(port.command('local', { type: 'user' }), { code: 'harness-unknown' });
    assert.deepEqual(events, []);
    assert.deepEqual(await port.stop('local'), { kind: 'confirmed' });
  });
}

test('claude harness: idle exit fact survives until explicit cleanup; get is not invented process liveness', { timeout: 5000 }, async t => {
  const port = own(t);
  const core = new SessionCore(port);
  t.after(async () => { await core.shutdown(); });
  core.create('local'); await core.start('local');
  await core.command('local', { type: 'fixture_exit' });
  await delay(75);
  assert.equal(core.get('local').status, 'running');
  await assert.rejects(core.command('local', request('inspect')), { code: 'harness-unknown' });
  assert.equal((await core.stop('local')).status, 'stopped');
});

test('claude harness: missing trusted executable is unknown, not readiness or observed cleanup', { timeout: 5000 }, async t => {
  const port = createClaudeHarness({ executable: join(tmpdir(), 'nonexistent-claude-fixture-executable'), stopDeadlineMs: 100 });
  t.after(() => port.stop('local'));
  assert.deepEqual(await port.start('local', () => {}), { kind: 'unknown' });
  // Node emits close after spawn failure: that observed close, not the error, proves cleanup.
  assert.deepEqual(await port.stop('local'), { kind: 'confirmed' });
});
