import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer, type AddressInfo } from 'node:net';
import { Server } from 'node:http';
import { listenDaemon } from '../src/daemon.ts';
import { FakePort } from './fake-port.ts';

const token = 'b'.repeat(43);
test('daemon startup: occupied loopback port fails without Pi effects; released port is usable', async () => {
  const blocker = createServer();
  await new Promise<void>(resolve => blocker.listen(0, '127.0.0.1', resolve));
  const port = (blocker.address() as AddressInfo).port;
  const harness = new FakePort();
  try { await assert.rejects(listenDaemon({ token, port, harness })); }
  finally { await new Promise<void>(resolve => blocker.close(() => resolve())); }
  assert.equal(harness.emitters.size, 0); assert.deepEqual(harness.stops, []);
  const daemon = await listenDaemon({ token, port, harness });
  await daemon.close(); await daemon.closed;
});

test('daemon startup: invalid post-bind address closes listener without child effects', async t => {
  const harness = new FakePort();
  const servers: Server[] = [];
  const original = Server.prototype.address;
  t.mock.method(Server.prototype, 'address', function (this: Server) { servers.push(this); return null; });
  await assert.rejects(listenDaemon({ token, port: 0, harness }), /invalid address/);
  assert.equal(servers.length, 1); assert.equal(servers[0].listening, false);
  assert.equal(harness.emitters.size, 0); assert.deepEqual(harness.stops, []);
  Server.prototype.address = original;
});
