import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { Server } from 'node:http';
import { createServer, type AddressInfo } from 'node:net';
import { join } from 'node:path';
import { test } from 'node:test';
import { listenDaemon } from '../src/daemon.ts';
import { FakePort } from './fake-port.ts';
import { metadataPath, nativeFixture } from './native-support.ts';

const token = 'startup-test-token-000000000000000000';
function gates(options: { stateDir: string; nativeSessionDir: string }) {
  return [options.stateDir, options.nativeSessionDir].map(root => existsSync(join(root, '.llm-sessiond.lock')));
}

test('native startup: occupied port rolls back gates and same-roots retry binds without native starts', async t => {
  const { options, core } = nativeFixture(t); await core.shutdown();
  const blocker = createServer();
  await new Promise<void>(resolve => blocker.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => blocker.close(() => resolve())));
  const port = (blocker.address() as AddressInfo).port;
  const harness = new FakePort();
  await assert.rejects(listenDaemon({ token, port, harness, native: options }), { code: 'EADDRINUSE' });
  assert.deepEqual(gates(options), [false, false]);
  const retry = await listenDaemon({ token, port: 0, harness, native: options });
  try {
    assert.ok(retry.port > 0);
    assert.equal(harness.emitters.size, 0);
  } finally { await retry.close(); await retry.closed; }
});

test('native startup: invalid post-bind address closes listener and releases owned gates', async t => {
  const { options, core } = nativeFixture(t); await core.shutdown();
  const address = Server.prototype.address;
  let captured: Server | undefined, bound: AddressInfo | undefined;
  t.after(() => new Promise<void>(resolve => captured ? captured.close(() => resolve()) : resolve()));
  const fault = t.mock.method(Server.prototype, 'address', function (this: Server) {
    captured = this;
    bound = address.call(this) as AddressInfo;
    return null;
  });
  const harness = new FakePort();
  await assert.rejects(listenDaemon({ token, port: 0, harness, native: options }), /invalid address/);
  fault.mock.restore();
  assert.ok(bound);
  assert.deepEqual(gates(options), [false, false]);
  const retry = await listenDaemon({ token, port: bound.port, harness, native: options });
  try {
    assert.equal(retry.port, bound.port);
    assert.equal(harness.emitters.size, 0);
  } finally { await retry.close(); await retry.closed; }
});

test('native startup: failed bind does not release gates for uncertain dirty cleanup', async t => {
  const { options, core } = nativeFixture(t);
  core.create('s'); await core.start('s');
  const file = metadataPath(options.stateDir), dirty = readFileSync(file, 'utf8');
  await core.shutdown(); writeFileSync(file, dirty);
  const blocker = createServer();
  await new Promise<void>(resolve => blocker.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => blocker.close(() => resolve())));
  const harness = new FakePort();
  await assert.rejects(listenDaemon({ token, port: (blocker.address() as AddressInfo).port,
    harness, native: options }), { code: 'EADDRINUSE' });
  assert.deepEqual(gates(options), [true, true]);
  assert.equal(harness.emitters.size, 0);
  assert.deepEqual(harness.stops, []);
});
