import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { createServer, type RequestListener, type ServerResponse } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cliProcess } from './api-cli-support.ts';
import { deferred } from './fake-port.ts';

async function fixture(t: TestContext, handler?: RequestListener) {
  const root = mkdtempSync(join(tmpdir(), 'cli config '));
  const config = join(root, 'private config.json'), token = 'a'.repeat(43);
  let calls = 0;
  const server = createServer((req, res) => {
    calls++;
    if (handler) handler(req, res);
    else { req.resume(); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{}'); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  writeFileSync(config, JSON.stringify({ token, port: address.port }), { mode: 0o600 });
  const actors: ReturnType<typeof cliProcess>[] = [];
  t.after(async () => {
    for (const actor of actors) await actor.cleanup();
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  });
  function launch(args: string[], input: string | Uint8Array = '') {
    const actor = cliProcess(args, input); actors.push(actor); return actor;
  }
  return { config, token, port: address.port, server, launch, get calls() { return calls; },
    run: (args: string[], input: string | Uint8Array = '') => launch(['--config', config, ...args], input).done };
}

test('api-cli grammar: missing/unknown/duplicate/extra args reject before HTTP without private diagnostics', async t => {
  const f = await fixture(t);
  const prefix = ['--config', f.config];
  for (const args of [[], ['list'], [...prefix], [...prefix, 'help'], [...prefix, '--help'],
    [...prefix, 'list', 'extra'], [...prefix, 'get'], [...prefix, 'get', '..'], [...prefix, 'get', 'a/b'],
    [...prefix, 'get', 'a?token=x'], [...prefix, '--config', f.config, 'list'],
    [...prefix, '--port', '1', '--port', '2', 'list'], [...prefix, 'list', '--port', String(f.port)],
    [...prefix, '--token', f.token, 'list'], [...prefix, '--host', 'example.test', 'list']]) {
    const result = await f.launch(args).done;
    assert.deepEqual({ code: result.code, stdout: result.stdout, stderr: result.stderr },
      { code: 2, stdout: '', stderr: 'invalid CLI input\n' });
  }
  for (const value of ['0', '65536', '-1', '1.5', 'NaN', '1e3', '']) {
    assert.equal((await f.run(['--port', value, 'list'])).code, 2);
  }
  assert.equal(f.calls, 0);
});

test('api-cli config: private path, strict JSON/UTF8/limits/token/port; no launch execution', async t => {
  const f = await fixture(t);
  for (const bytes of ['{', 'null', '[]', JSON.stringify({ token: 'private-short', port: f.port }),
    JSON.stringify({ token: f.token, port: -1 }), JSON.stringify({ token: f.token, extra: true }),
    Buffer.from([0xff]), '\ufeff{}', 'x'.repeat(65537)]) {
    writeFileSync(f.config, bytes);
    const result = await f.run(['list']);
    assert.equal(result.code, 2); assert.equal(result.stdout, ''); assert.equal(result.stderr, 'invalid CLI input\n');
  }
  assert.equal(f.calls, 0);
  writeFileSync(f.config, JSON.stringify({ token: f.token, port: 0,
    launch: { executable: '/private/must-not-execute', prefixArgs: ['--private'], cwd: '/private/missing' } }));
  assert.equal((await f.run(['list'])).code, 2);
  const overridden = await f.run(['--port', String(f.port), 'list'], 'stdin is ignored for list');
  assert.equal(overridden.code, 0); assert.equal(overridden.stdout, '{}\n'); assert.equal(overridden.stderr, '');
  assert.equal(f.calls, 1);
  const missing = await f.launch(['--config', join(f.config, 'not-a-file'), 'list']).done;
  assert.equal(missing.code, 2); assert.equal(missing.stderr, 'invalid CLI input\n');
});

test('api-cli stdin: command/reply require object JSON; compact zero bytes only is optional, whitespace is invalid', async t => {
  const f = await fixture(t);
  for (const operation of ['command', 'reply', 'compact']) {
    for (const input of [' ', '\n', '{', '[]', 'null', Buffer.from([0xff]), '\ufeff{}', 'x'.repeat(65537)]) {
      const result = await f.run([operation, 's'], input);
      assert.equal(result.code, 2); assert.equal(result.stdout, ''); assert.equal(result.stderr, 'invalid CLI input\n');
    }
  }
  for (const [op, body] of [['command', ''], ['reply', ''], ['command', '{}'], ['command', '{"type":1}'],
    ['compact', '{"customInstructions":null}'], ['compact', '{"customInstructions":4}'], ['compact', '{"type":"compact"}'],
    ['compact', '{"customInstructions":"x","extra":true}'], ['reply', '{"requestId":"q","method":"confirm","value":true}']]) {
    assert.equal((await f.run([op, 's'], body)).code, 2);
  }
  assert.equal(f.calls, 0);
  for (const body of ['', '{}', ' {"customInstructions":"🙂"}\n']) assert.equal((await f.run(['compact', 's'], body)).code, 0);
  assert.equal(f.calls, 3);
});

for (const status of [200, 401, 409, 500]) {
  test(`api-cli HTTP${status}: whole JSON/errors and exit code, no output envelope`, async t => {
    const value = status === 200 ? { type: 'response', id: 'native-r', command: 'future_native', success: false,
      error: 'native refusal', data: { opaque: ['🙂'] }, metadata: { usage: [1] } } : { error: { code: 'existing-api-error' }, optional: [1] };
    const received = deferred<{ path: string; method: string; body: unknown; auth: string | undefined }>();
    const f = await fixture(t, (req, res) => {
      let text = ''; req.setEncoding('utf8'); req.on('data', chunk => { text += chunk; });
      req.on('end', () => {
        received.resolve({ path: req.url!, method: req.method!, body: JSON.parse(text), auth: req.headers.authorization });
        res.writeHead(status, { 'Content-Type': 'application/json' });
        for (const byte of Buffer.from(JSON.stringify(value))) res.write(Buffer.from([byte]));
        res.end();
      });
    });
    const body = { type: 'future_native', arbitrary: { nested: ['text'] } };
    const result = await f.run(['command', 's'], JSON.stringify(body));
    assert.equal(result.code, status === 200 ? 0 : 1); assert.equal(result.stdout, JSON.stringify(value) + '\n');
    assert.equal(result.stderr, '');
    assert.deepEqual(await received.promise, { path: '/sessions/s/command', method: 'POST', body, auth: `Bearer ${f.token}` });
    assert.equal(f.calls, 1);
  });
}

for (const failure of ['redirect', 'bare', 'json', 'utf8', 'truncated', 'content-type', 'loss']) {
  test(`api-cli transport ${failure}: exit1, safe diagnostic, no invented JSON or redirect/retry`, async t => {
    const f = await fixture(t, (req, res) => {
      req.resume();
      if (failure === 'loss') { res.destroy(); return; }
      res.writeHead(failure === 'redirect' ? 307 : failure === 'bare' ? 400 : 200,
        { 'Content-Type': failure === 'bare' || failure === 'content-type' ? 'text/plain' : 'application/json',
          ...(failure === 'redirect' ? { Location: 'http://example.test/private' } : {}),
          ...(failure === 'truncated' ? { 'Content-Length': '100' } : {}) });
      res.end(failure === 'utf8' ? Buffer.from([0xff]) : failure === 'json' ? '{private' : 'private body');
    });
    const result = await f.run(['list']);
    assert.equal(result.code, 1); assert.equal(result.stdout, ''); assert.equal(result.stderr, 'API transport failed\n');
    assert.equal(f.calls, 1);
  });
}

for (const ending of ['clean', 'loss', 'incomplete', 'utf8']) {
  test(`api-cli events: ${ending} EOF preserves delivered prefix, never reconnects or invents JSON`, async t => {
    const entered = deferred<ServerResponse>();
    const f = await fixture(t, (req, res) => {
      req.resume(); res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('event: ready\ndata: {}\n\n'); entered.resolve(res);
    });
    const actor = f.launch(['--config', f.config, 'events']);
    const response = await entered.promise;
    await actor.next(value => value.event === 'ready');
    const data = { type: 'text', sessionId: 's', text: '🙂\nПривет\u2028' };
    if (ending === 'clean') {
      for (const byte of Buffer.from(`event: core\ndata: ${JSON.stringify(data)}\n\n`)) response.write(Buffer.from([byte]));
      response.end();
    } else if (ending === 'loss') response.destroy();
    else response.end(ending === 'utf8' ? Buffer.from([0xe2, 0x82]) : 'event: core\ndata: {}\n');
    const result = await actor.done;
    assert.equal(result.code, ending === 'clean' ? 0 : 1);
    assert.equal(result.stdout, '{"event":"ready","data":{}}\n' + (ending === 'clean' ? JSON.stringify({ event: 'core', data }) + '\n' : ''));
    assert.equal(result.stderr, ending === 'clean' ? '' : 'API transport failed\n');
    assert.equal(f.calls, 1);
  });
}

test('api-cli refused connection: no local process spawn or retry', async t => {
  const f = await fixture(t);
  await new Promise<void>(resolve => f.server.close(() => resolve()));
  const result = await f.run(['list']);
  assert.equal(result.code, 1); assert.equal(result.stdout, ''); assert.equal(result.stderr, 'API transport failed\n');
  assert.equal(f.calls, 0);
});
