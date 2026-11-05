// Portable external-process smoke, identical on Linux and Windows. No Core/TS imports.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { apiClient } from './api-client.mjs';

const root = mkdtempSync(join(tmpdir(), 'llm-sessiond-api-'));
const token = randomBytes(32).toString('base64url');
const child = spawn(process.execPath, [fileURLToPath(new URL('../src/daemon-cli.ts', import.meta.url))], { stdio: 'pipe' });
let stdout = '', stderr = '';
child.stdout.on('data', bytes => { stdout += bytes; });
child.stderr.on('data', bytes => { stderr += bytes; });
const exit = once(child, 'exit');
const deadline = setTimeout(() => { child.kill(); process.exitCode = 1; }, 30_000);
let stream;
try {
  const lines = createInterface({ input: child.stdout });
  const ready = once(lines, 'line');
  child.stdin.end(JSON.stringify({ token, port: 0, launch: { executable: process.execPath,
    prefixArgs: [fileURLToPath(new URL('./api-native-child.ts', import.meta.url)), root] } }));
  const [line] = await ready;
  const { listening } = JSON.parse(line);
  assert.equal(listening.host, '127.0.0.1');
  const api = apiClient(listening.port, token);
  stream = await api.stream();
  await api.request('/sessions', { sessionId: 'external' });
  assert.equal((await api.request('/sessions/external/start', {})).status, 'running');
  await api.request('/sessions/external/send', { inputId: 'clarify', text: 'fixture:clarify' });
  await stream.next(f => f.event === 'core' && f.data.type === 'text' && f.data.text.includes('fixture:clarify:'));
  await stream.next(f => f.event === 'core' && f.data.type === 'input' && f.data.input.inputId === 'clarify' && f.data.input.status === 'completed');
  await api.request('/sessions/external/send', { inputId: 'answer', text: 'fixture-blue' });
  for (const method of ['confirm', 'select', 'input']) {
    await stream.next(f => f.event === 'core' && f.data.type === 'question' && f.data.question.method === method);
  }
  assert.equal(readFileSync(join(root, 'owned.txt'), 'utf8'), 'fixture-owned-bytes\n');
  const replies = [
    { requestId: 'confirm-id', method: 'confirm', confirmed: true },
    { requestId: 'select-id', method: 'select', value: 'blue' },
    { requestId: 'input-id', method: 'input', value: 'hello' },
  ];
  await api.request('/sessions/external/reply', { ...replies[0], requestId: 'wrong' }).then(v => assert.equal(v.kind, 'rejected'));
  await api.request('/sessions/external/reply', { ...replies[1], value: 'not-an-option' }).then(v => assert.equal(v.kind, 'rejected'));
  for (const reply of replies) assert.equal((await api.request('/sessions/external/reply', reply)).kind, 'written');
  assert.equal((await api.request('/sessions/external/reply', replies[0])).kind, 'rejected');
  const result = await stream.next(f => f.event === 'core' && f.data.type === 'tool' && f.data.phase === 'end' && f.data.toolCallId === 'consumed');
  assert.deepEqual(JSON.parse(result.data.result.content[0].text), [
    { id: 'confirm-id', value: true }, { id: 'select-id', value: 'blue' }, { id: 'input-id', value: 'hello' },
  ]);
  await stream.next(f => f.event === 'core' && f.data.type === 'input' && f.data.input.inputId === 'answer' && f.data.input.status === 'completed');
  assert.equal((await api.request('/sessions/external')).input.status, 'completed');
  await api.request('/sessions/external/send', { inputId: 'cancel-target', text: 'fixture:wait' });
  const waiting = await stream.next(f => f.event === 'core' && f.data.type === 'tool' && f.data.toolCallId === 'wait' && f.data.phase === 'start');
  await api.request('/sessions/external/cancel', { inputId: 'wrong' }, 409);
  assert.equal((await api.request('/sessions/external/cancel', { inputId: 'cancel-target' })).status, 'cancelled');
  await stream.next(f => f.event === 'core' && f.data.type === 'tool' && f.data.toolCallId === 'wait' && f.data.phase === 'end' && f.data.result.content[0].text === 'abort-received');
  await stream.next(f => f.event === 'core' && f.data.type === 'input' && f.data.input.inputId === 'cancel-target' && f.data.input.status === 'cancelled');
  assert.equal((await api.request('/sessions/external')).status, 'running');
  await api.request('/sessions/external/send', { inputId: 'continue', text: 'fixture:recall' });
  await stream.next(f => f.event === 'core' && f.data.type === 'text' && f.data.text === `fixture:recall:fixture:clarify:${waiting.data.args.pid}`);
  await stream.next(f => f.event === 'core' && f.data.type === 'input' && f.data.input.inputId === 'continue' && f.data.input.status === 'completed');
  assert.equal((await api.request('/sessions/external/stop', {})).status, 'stopped');
  assert.deepEqual(await api.request('/shutdown', {}), { stoppedSessionIds: [], uncertainSessionIds: [], failedSessionIds: [] });
  assert.deepEqual(await exit, [0, null]);
  assert.equal(readFileSync(join(root, 'health'), 'utf8'), 'healthy');
  assert.equal(stdout.includes(token) || stderr.includes(token) || JSON.stringify(stream.events).includes(token), false);
  assert.equal(stderr, '');
  console.log(JSON.stringify({ smoke: 'passed', platform: process.platform, node: process.version,
    client: 'external HTTP/JSON + SSE, no project TypeScript imports', events: stream.events.length,
    types: [...new Set(stream.events.filter(f => f.event === 'core').map(f => f.data.type))],
    disk: 'verified', consumed: 'three explicit replies verified', cancellation: 'targeted cancelled + same-PID context recall verified', ownedExit: 'stop confirmed' }));
} finally {
  clearTimeout(deadline);
  if (stream) await stream.close();
  if (child.exitCode === null && child.signalCode === null) { child.kill(); await exit; }
  rmSync(root, { recursive: true, force: true });
}
