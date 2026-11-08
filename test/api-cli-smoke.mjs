// Portable CLI -> real daemon subprocess -> Node fake RPC child. Never launches Native Pi.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { smokeDaemon } from './smoke-daemon.mjs';
import { cliProcess } from './api-cli-support.ts';

const root = mkdtempSync(join(tmpdir(), 'cli smoke '));
const actors = [];
let daemon;
try {
  daemon = await smokeDaemon(root, ['--fixture-startup-question']);
  const config = join(root, 'private config.json');
  writeFileSync(config, JSON.stringify({ token: daemon.token, port: 0,
    launch: { executable: 'never-execute-client-launch-field' } }), { mode: 0o600 });
  const prefix = ['--config', config, '--port', new URL(daemon.base).port];
  const launch = (args, body = '') => {
    const actor = cliProcess([...prefix, ...args], typeof body === 'string' ? body : JSON.stringify(body), 30_000);
    actors.push(actor); return actor;
  };
  const run = async (args, body = '', code = 0) => {
    const result = await launch(args, body).done;
    assert.equal(result.code, code, result.stderr); assert.equal(result.stderr, '');
    const value = JSON.parse(result.stdout);
    assert.equal(result.stdout, JSON.stringify(value) + '\n');
    return value;
  };
  assert.deepEqual(await run(['list']), []);
  const id = 'cli.session';
  assert.deepEqual(await run(['create', id]), { sessionId: id, status: 'created' });
  assert.deepEqual(await run(['get', id]), { sessionId: id, status: 'created' });
  const events = launch(['events']);
  assert.deepEqual(await events.next(f => f.event === 'ready'), { event: 'ready', data: {} });
  let startDone = false;
  const start = launch(['start', id]); void start.done.then(() => { startDone = true; });
  const question = await events.next(f => f.event === 'core' && f.data.type === 'question');
  assert.equal(question.data.sessionId, id);
  assert.equal((await run(['get', id])).status, 'starting'); assert.equal(startDone, false);
  assert.deepEqual(await run(['reply', id], { requestId: question.data.question.requestId,
    method: 'confirm', confirmed: true }), { kind: 'written' });
  const started = await start.done;
  assert.equal(started.code, 0); assert.equal(started.stderr, '');
  assert.deepEqual(JSON.parse(started.stdout), { sessionId: id, status: 'running' });
  const body = { type: 'future_native', opaque: { value: ['🙂', 'Привет\u2028'] }, observations: true };
  const response = await run(['command', id], body);
  assert.deepEqual(response, { type: 'response', id: response.id, command: body.type, success: true,
    data: { disposition: 'started', received: { ...body, id: response.id }, pid: response.data.pid },
    optionalMetadata: { fixture: true } });
  const text = await events.next(f => f.event === 'core' && f.data.type === 'text');
  assert.equal(text.data.text, '🙂 fixture text');
  const tool = await events.next(f => f.event === 'core' && f.data.type === 'tool' && f.data.phase === 'update');
  assert.deepEqual(tool.data, { type: 'tool', sessionId: id, phase: 'update', toolCallId: 'tool-id',
    toolName: 'fixture', args: {}, partialResult: { content: ['partial'] } });
  for (const answer of [
    { requestId: 'confirm-id', method: 'confirm', cancelled: true },
    { requestId: 'select-id', method: 'select', value: 'blue' },
    { requestId: 'input-id', method: 'input', value: 'hello' },
  ]) assert.deepEqual(await run(['reply', id], answer), { kind: 'written' });
  assert.deepEqual(await run(['reply', id], { requestId: 'unknown', method: 'confirm', confirmed: true }), { kind: 'rejected' });
  for (const input of ['', '{}', { customInstructions: 'preserve 🙂' }]) {
    const compact = await run(['compact', id], input);
    const instructions = typeof input === 'object' ? { customInstructions: input.customInstructions } : {};
    assert.deepEqual(compact, { type: 'response', id: compact.id, command: 'compact', success: true,
      data: { summary: 'whole summary', firstKeptEntryId: 'abc', tokensBefore: 150000,
        estimatedTokensAfter: 123, usage: { input: 2 }, details: { opaque: [1] },
        received: { type: 'compact', ...instructions, id: compact.id } }, optionalMetadata: { fixture: true } });
  }
  const refusal = await run(['command', id], { type: 'prompt', refuse: true });
  assert.deepEqual(refusal, { type: 'response', id: refusal.id, command: 'prompt', success: false,
    error: 'native refusal', optionalMetadata: { busy: true }, details: ['whole'] });
  assert.deepEqual(await run(['create', id], '', 1), { error: { code: 'duplicate-session' } });
  assert.deepEqual(await run(['list']), [{ sessionId: id, status: 'running' }]);
  assert.deepEqual(await run(['stop', id]), { sessionId: id, status: 'stopped' });
  assert.deepEqual(await run(['shutdown']), { stoppedSessionIds: [], uncertainSessionIds: [], failedSessionIds: [] });
  const eventOutput = await events.done;
  assert.equal(eventOutput.code, 0); assert.equal(eventOutput.stderr, '');
  const frames = eventOutput.stdout.trimEnd().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(frames[0], { event: 'ready', data: {} });
  assert.ok(frames.some(f => f.event === 'core' && f.data.type === 'session' && f.data.session.status === 'stopped'));
  assert.equal(JSON.stringify(frames).includes('private'), false);
  for (const actor of actors) {
    const result = await actor.done;
    assert.equal(result.stdout.includes(daemon.token) || result.stderr.includes(daemon.token), false);
  }
  await daemon.exited();
  console.log(JSON.stringify({ apiCliSmoke: 'passed', platform: process.platform, operations: 10,
    frames: frames.length, scope: 'actual CLI/daemon subprocesses, Node fake child, full JSON/native error/compact, startup explicit reply, NDJSON, explicit cleanup' }));
} finally {
  for (const actor of actors) await actor.cleanup();
  await daemon?.cleanup();
  rmSync(root, { recursive: true, force: true });
}
