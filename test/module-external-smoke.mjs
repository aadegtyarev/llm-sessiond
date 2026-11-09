// Portable external CLI -> daemon -> owned Node fakes. No Core/port execution imports.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { cliProcess } from './api-cli-support.ts';
import { apiClient } from './api-client.mjs';

const root = mkdtempSync(join(tmpdir(), 'mixed module smoke '));
const token = 'integration_' + randomBytes(32).toString('base64url');
const ledger = join(root, 'owned-children.ndjson');
const configPath = join(root, 'private config.json');
const actors = [];
let child, closed, deadline, lines;
let daemonStdout = '', daemonStderr = '';
try {
  const piCwd = join(root, 'pi cwd'), claudeCwd = join(root, 'claude cwd');
  mkdirSync(piCwd); mkdirSync(claudeCwd);
  const config = { token, port: 0,
    launch: { executable: 'legacy-must-not-execute', prefixArgs: ['--legacy-must-not-leak'], cwd: 'missing-legacy-cwd' },
    harnesses: {
      pi: { executable: process.execPath, prefixArgs: [fileURLToPath(new URL('./translator-child.ts', import.meta.url)), '--pi-only'],
        cwd: piCwd, stopDeadlineMs: 3000 },
      'claude-code': { executable: process.execPath,
        prefixArgs: [fileURLToPath(new URL('./module-external-fixture.mjs', import.meta.url)), ledger, 'claude-fake'],
        cwd: claudeCwd, stopDeadlineMs: 3000 },
    } };
  writeFileSync(configPath, JSON.stringify(config), { mode: 0o600 });
  child = spawn(process.execPath, [fileURLToPath(new URL('../src/daemon-cli.ts', import.meta.url))], { stdio: 'pipe', shell: false });
  closed = once(child, 'close');
  deadline = setTimeout(() => child.kill(), 90_000);
  child.stdout.on('data', chunk => { daemonStdout += chunk; });
  child.stderr.on('data', chunk => { daemonStderr += chunk; });
  child.stdin.on('error', () => {});
  lines = createInterface({ input: child.stdout });
  const ready = once(lines, 'line');
  child.stdin.end(JSON.stringify(config));
  const [line] = await Promise.race([ready, closed.then(() => { throw new Error('daemon closed before bind'); })]);
  const { listening } = JSON.parse(line);
  assert.equal(listening.host, '127.0.0.1'); assert.ok(listening.port > 0);
  assert.equal(existsSync(ledger), false); // Module registration never spawns a native child.
  const prefix = ['--port', String(listening.port), '--config', configPath];
  const launch = (args, body = '') => {
    const actor = cliProcess([...prefix, ...args], typeof body === 'string' ? body : JSON.stringify(body), 60_000);
    actors.push(actor); return actor;
  };
  const run = async (args, body = '', code = 0) => {
    const result = await launch(args, body).done;
    assert.equal(result.code, code, result.stderr); assert.equal(result.stderr, '');
    const value = JSON.parse(result.stdout);
    assert.equal(result.stdout, JSON.stringify(value) + '\n');
    return value;
  };
  const control = (subtype, extra = {}) => ({ type: 'control_request', request: { subtype }, ...extra });
  const command = (id, body, code = 0) => run(['command', id], body, code);
  const events = launch(['events']);
  assert.deepEqual(await events.next(f => f.event === 'ready'), { event: 'ready', data: {} });
  const coreFrame = (id, predicate) => events.next(f => f.event === 'core' && f.data.sessionId === id && predicate(f.data));
  const nativeFrame = (id, predicate) => coreFrame(id, e => e.type === 'native-record' && predicate(e.record));
  assert.deepEqual(await run(['create', 'legacy']), { sessionId: 'legacy', status: 'created' });
  assert.deepEqual(await run(['--harness', 'missing / module', 'create', 'unknown'], '', 1), { error: { code: 'harness-rejected' } });
  const client = apiClient(listening.port, token);
  for (const body of [{ sessionId: 'invalid', harness: '' }, { sessionId: 'invalid', harness: null },
    { sessionId: 'invalid', harness: 'pi', extra: 1 }]) {
    assert.deepEqual(await client.request('/sessions', body, 400), { error: { code: 'schema' } });
  }
  assert.deepEqual(await run(['list']), [{ sessionId: 'legacy', status: 'created' }]);
  const modules = [['pi.local', 'pi'], ['claude.local', 'claude-code'], ['claude.second', 'claude-code']];
  for (const [id, harness] of modules) {
    assert.deepEqual(await run(['--harness', harness, 'create', id]), { sessionId: id, status: 'created', harness });
    assert.deepEqual(await run(['get', id]), { sessionId: id, status: 'created', harness });
  }
  assert.equal(existsSync(ledger), false);
  for (const [id, harness] of modules) {
    assert.deepEqual(await run(['start', id]), { sessionId: id, status: 'running', harness });
  }
  const pi = await command('pi.local', { type: 'get_state' });
  assert.deepEqual(pi.data.argv, ['--pi-only', '--mode', 'rpc']); assert.equal(pi.data.cwd, piCwd);
  const inspect = await command('claude.local', control('inspect'));
  const observed = inspect.response.response;
  assert.equal(observed.cwd, claudeCwd); assert.equal(observed.credentialInEnv, false);
  assert.deepEqual(observed.argv.slice(2), ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json',
    '--verbose', '--include-partial-messages', '--permission-prompts', 'host']);
  assert.deepEqual(observed.initialized.request, { subtype: 'initialize', hooks: null });
  assert.equal(observed.initialized.type, 'control_request');
  assert.equal(typeof observed.initialized.request_id, 'string');
  const second = await command('claude.second', control('inspect'));
  assert.notEqual(second.response.response.pid, observed.pid); assert.notEqual(observed.pid, pi.data.pid);
  assert.equal(JSON.stringify([pi, inspect, second]).includes(token), false);
  assert.equal(JSON.stringify([pi, inspect, second]).includes('--legacy-must-not-leak'), false);

  // Two successful local user writes precede any result; no ACK or result/user FIFO.
  const users = ['first 🙂', 'second'].map(content => ({ type: 'user', session_id: 'pi.local', parent_tool_use_id: null,
    message: { role: 'user', content }, future: { preserve: [false, 1] } }));
  for (const user of users) assert.deepEqual(await command('claude.local', user), { kind: 'written' });
  const before = (await command('claude.local', control('inspect'))).response.response;
  assert.deepEqual(before.users, users); assert.equal(before.resultCount, 0); assert.deepEqual(before.answers, []);
  const permission = (await nativeFrame('claude.local', r => r.type === 'control_request')).data.record;
  assert.deepEqual(permission, { type: 'control_request', request_id: 'permission-native', session_id: 'pi.local',
    request: { subtype: 'can_use_tool', tool_name: 'Read', tool_use_id: 'native-tool',
      input: { paths: ['🙂/one', 'two'], nested: { allow: false, options: [1, null] } },
      permission_suggestions: [{ type: 'addRules', rules: [{ toolName: 'Read', ruleContent: 'docs/**' }], behavior: 'allow', destination: 'session' }],
      blocked_path: '🙂/one', decision_reason: 'explicit operator required', future: { preserve: true } },
    future: { requestMetadata: ['untouched'] } });

  // Native requests remain concurrent; independent Pi, interrupt and explicit answer work while both are held.
  let pendingOneDone = false, pendingTwoDone = false;
  const one = control('fixture_hold', { request_id: 'held-one', future: { order: 1 } });
  const two = control('fixture_hold', { request_id: 'held-two', future: { order: 2 } });
  const pendingOne = launch(['command', 'claude.local'], one);
  void pendingOne.done.then(() => { pendingOneDone = true; });
  await nativeFrame('claude.local', r => r.fixtureHeld === 'held-one');
  const pendingTwo = launch(['command', 'claude.local'], two);
  void pendingTwo.done.then(() => { pendingTwoDone = true; });
  await nativeFrame('claude.local', r => r.fixtureHeld === 'held-two');
  const interrupted = await command('claude.local', control('interrupt', { request_id: 'interrupt-native' }));
  assert.deepEqual(interrupted.response.response.original, control('interrupt', { request_id: 'interrupt-native' }));
  const piCommand = await command('pi.local', { type: 'future_pi', observations: true, arbitrary: ['pi 🙂'] });
  assert.equal(piCommand.success, true); assert.equal(piCommand.command, 'future_pi');
  const permissionAnswer = { type: 'control_response', response: { subtype: 'success', request_id: permission.request_id,
    response: { behavior: 'allow', updatedInput: { paths: ['operator-chosen'], nested: { choices: [false, 9] } },
      updatedPermissions: [{ type: 'setMode', mode: 'default', destination: 'session' }], future: ['whole'] } },
    future: { answer: true } };
  assert.deepEqual(await command('claude.local', permissionAnswer), { kind: 'written' });
  assert.deepEqual((await nativeFrame('claude.local', r => r.echoedAnswer)).data.record.echoedAnswer, permissionAnswer);
  assert.deepEqual(await run(['reply', 'claude.local'], { requestId: permission.request_id, method: 'confirm', confirmed: true }), { kind: 'rejected' });
  assert.deepEqual(await run(['compact', 'claude.local'], '', 1), { error: { code: 'harness-rejected' } });
  const held = (await command('claude.local', control('inspect'))).response.response;
  assert.deepEqual(held.pending, ['held-one', 'held-two']); assert.deepEqual(held.answers, [permissionAnswer]);
  assert.equal(held.resultCount, 0); assert.equal(pendingOneDone, false); assert.equal(pendingTwoDone, false);
  await command('claude.local', control('fixture_release'));
  for (const [actor, original] of [[pendingTwo, two], [pendingOne, one]]) {
    const output = await actor.done;
    assert.equal(output.code, 0); assert.equal(output.stderr, '');
    assert.deepEqual(JSON.parse(output.stdout), { type: 'control_response',
      response: { subtype: 'success', request_id: original.request_id, response: { original },
        future: { usage: { input_tokens: 7 }, opaque: [1, false] } }, metadata: { native: 'fake-only' } });
  }
  const nativeError = await command('claude.local', control('fixture_native_error', { request_id: 'native-error-control' }));
  assert.deepEqual(nativeError, { type: 'control_response', response: { subtype: 'error', request_id: 'native-error-control',
    error: 'fake native error', details: ['whole', false], future: { usage: { input_tokens: 7 }, opaque: [1, false] } },
    metadata: { native: 'fake-only' } });

  await command('claude.local', control('fixture_turn'));
  await nativeFrame('claude.local', r => r.type === 'control_cancel_request');
  // Same native IDs in the other child still route only through that child's local callback.
  assert.deepEqual(await command('claude.second', users[0]), { kind: 'written' });
  await command('claude.second', control('fixture_turn'));
  await nativeFrame('claude.second', r => r.type === 'control_cancel_request');
  for (const id of ['claude.local', 'claude.second']) {
    const success = (await nativeFrame(id, r => r.uuid === 'native-result-id')).data.record;
    assert.deepEqual(success, { type: 'result', subtype: 'success', is_error: false, result: 'whole native 🙂 result',
      session_id: 'pi.local', uuid: 'native-result-id', usage: { input_tokens: 11, output_tokens: 5 },
      modelUsage: { fake_model: { costUSD: 0 } }, total_cost_usd: 0, duration_ms: 12, duration_api_ms: 7, num_turns: 1,
      future: { metadata: [false, { native: 'kept' }] } });
    assert.deepEqual((await nativeFrame(id, r => r.uuid === 'native-error-id')).data.record,
      { type: 'result', subtype: 'error_during_execution', is_error: true, errors: ['fake native failure', 'whole details'],
        session_id: 'pi.local', uuid: 'native-error-id', usage: { input_tokens: 13, output_tokens: 0 }, future: { details: [2] } });
    assert.deepEqual((await nativeFrame(id, r => r.type === 'control_cancel_request')).data.record,
      { type: 'control_cancel_request', request_id: 'permission-native', future: { reason: 'fake cancellation' } });
    assert.deepEqual((await coreFrame(id, e => e.type === 'tool' && e.phase === 'start')).data,
      { type: 'tool', sessionId: id, phase: 'start', toolCallId: 'native-tool', toolName: 'Read',
        args: { paths: ['🙂/one'], nested: [false, 3] } });
    const tool = await coreFrame(id, e => e.type === 'tool' && e.phase === 'end');
    assert.deepEqual(tool.data, { type: 'tool', sessionId: id, phase: 'end', toolCallId: 'native-tool', toolName: 'Read',
      result: [{ type: 'text', text: 'tool-native-output' }], isError: false });
  }

  for (const [id, harness] of modules) assert.deepEqual(await run(['stop', id]), { sessionId: id, status: 'stopped', harness });
  assert.deepEqual(await run(['stop', 'legacy']), { sessionId: 'legacy', status: 'stopped' });
  assert.deepEqual(await run(['shutdown']), { stoppedSessionIds: [], uncertainSessionIds: [], failedSessionIds: [] });
  const output = await events.done;
  assert.equal(output.code, 0); assert.equal(output.stderr, '');
  assert.deepEqual(await closed, [0, null]);
  assert.equal(daemonStderr, ''); assert.equal(daemonStdout.includes(token), false);
  const frames = output.stdout.trimEnd().split('\n').map(value => JSON.parse(value));
  assert.deepEqual(frames[0], { event: 'ready', data: {} });
  assert.equal(frames.filter(f => f.event === 'ready').length, 1);
  assert.ok(frames.every(f => ['ready', 'core'].includes(f.event)));
  for (const id of ['claude.local', 'claude.second']) {
    assert.deepEqual(frames.filter(f => f.event === 'core' && f.data.type === 'text' && f.data.sessionId === id)
      .map(f => f.data.text), ['🙂 При', 'вет\u2028']);
    assert.deepEqual(frames.filter(f => f.event === 'core' && f.data.type === 'tool' && f.data.sessionId === id)
      .map(f => f.data.phase), ['start', 'end']);
  }
  assert.ok(frames.some(f => f.event === 'core' && f.data.type === 'text' && f.data.sessionId === 'pi.local' && f.data.text === '🙂 fixture text'));
  assert.equal(frames.some(f => f.event === 'core' && f.data.type === 'native-record' && f.data.sessionId === 'pi.local'), false);
  assert.equal(frames.some(f => f.event === 'core' && f.data.type === 'session' && ['invalid', 'unknown'].includes(f.data.session.sessionId)), false);
  for (const [id, harness] of modules) {
    assert.deepEqual(frames.filter(f => f.event === 'core' && f.data.type === 'session' && f.data.session.sessionId === id)
      .map(f => f.data.session), ['created', 'starting', 'running', 'stopped'].map(status => ({ sessionId: id, status, harness })));
  }
  assert.deepEqual(frames.filter(f => f.event === 'core' && f.data.type === 'session' && f.data.session.sessionId === 'legacy')
    .map(f => f.data.session), ['created', 'stopped'].map(status => ({ sessionId: 'legacy', status })));
  for (const marker of ['private-thinking', 'private-system', 'private-stderr', 'final-text-must-not-duplicate']) {
    assert.equal(output.stdout.includes(marker), false);
  }
  const records = readFileSync(ledger, 'utf8').trimEnd().split('\n').map(value => JSON.parse(value));
  assert.deepEqual(records.filter(record => record.event.startsWith('control-response:')).map(record => record.event),
    ['control-response:held-two', 'control-response:held-one']);
  const spawned = records.filter(record => record.event === 'spawn').map(record => record.pid);
  assert.equal(spawned.length, 2); assert.equal(new Set(spawned).size, 2);
  // Each HTTP stop above is confirmed by the server's observed own exit/close, not a kill return.
  // Do not require POSIX signal/exit handlers: Windows may terminate Node without running them.
  for (const actor of actors) {
    const result = await actor.done;
    assert.equal(result.stdout.includes(token) || result.stderr.includes(token), false);
  }
  console.log(JSON.stringify({ moduleExternalSmoke: 'passed', platform: process.platform, frames: frames.length,
    ownedClaudeSpawns: spawned.length, observedProcessStops: modules.length, scope: 'actual CLI/daemon, Node-only mixed Pi+Claude fakes, native fields/permissions/concurrency, observed cleanup; not real provider proof' }));
} finally {
  for (const actor of actors) await actor.cleanup();
  clearTimeout(deadline); lines?.close();
  if (child && child.exitCode === null && child.signalCode === null) child.kill();
  await closed;
  rmSync(root, { recursive: true, force: true });
}
