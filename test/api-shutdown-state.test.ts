import assert from 'node:assert/strict';
import { request, Server, type IncomingMessage } from 'node:http';
import test from 'node:test';
import { SessionCore, type PortOutcome } from '../src/core.ts';
import { apiFixture } from './api-support.ts';
import { FakePort, deferred } from './fake-port.ts';

// Only owned ephemeral HTTP connections and fake ports are used here.
for (const operation of ['create', 'command'] as const) {
  test(`daemon rejects ${operation} body completed after shutdown, with both admission gates intact`, async t => {
    const port = new FakePort();
    const gate = deferred<PortOutcome>();
    const entered = deferred<void>();
    port.stop = id => { port.stops.push(id); entered.resolve(); return gate.promise; };
    t.after(() => gate.resolve({ kind: 'confirmed' }));
    const api = await apiFixture(t, port);
    await api.running();
    const create = t.mock.method(SessionCore.prototype, 'create');
    const path = operation === 'create' ? '/sessions' : '/sessions/s/command';
    const payload = operation === 'create' ? '{"sessionId":"late"}' : '{"type":"future","extra":1}';
    const reading = deferred<{ request: IncomingMessage; dataListeners: number; complete: boolean }>();
    const originalEmit = Server.prototype.emit;
    const emit = t.mock.method(Server.prototype, 'emit', function (this: Server, event: string | symbol, ...args: unknown[]) {
      const result: boolean = Reflect.apply(originalEmit, this, [event, ...args]);
      if (event === 'request') {
        const incoming = args[0] as IncomingMessage;
        if (incoming.url === path) {
          reading.resolve({ request: incoming, dataListeners: incoming.listenerCount('data'), complete: incoming.complete });
        }
      }
      return result;
    });
    const pending = request({
      hostname: '127.0.0.1', port: api.daemon.port, path, method: 'POST', agent: false,
      headers: { Authorization: `Bearer ${api.token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    });
    const response = new Promise<{ status: number | undefined; body: unknown }>((resolve, reject) => {
      pending.once('error', reject);
      pending.once('response', incoming => {
        const chunks: Buffer[] = [];
        incoming.on('data', chunk => chunks.push(chunk));
        incoming.once('error', reject);
        incoming.once('end', () => {
          try { resolve({ status: incoming.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); }
          catch (error) { reject(error); }
        });
      });
    });
    // Attach a rejection handler immediately; the main path below still asserts the result.
    void response.catch(() => {});
    let closing: ReturnType<typeof api.daemon.close> | undefined;
    try {
      pending.write(payload.slice(0, 1));
      const captured = await reading.promise;
      assert.ok(captured.dataListeners > 0, 'requestBody installed its data listener before shutdown');
      assert.equal(captured.complete, false);
      assert.equal(captured.request.complete, false);
      emit.mock.restore();
      closing = api.daemon.close();
      await entered.promise;
      assert.deepEqual(port.stops, ['s']);
      // A fresh malformed body must be refused by the first gate, before JSON parsing.
      assert.deepEqual(await api.request('/sessions', {}, 503, { body: 'not-json' }), { error: { code: 'closed' } });
      pending.end(payload.slice(1));
      assert.deepEqual(await response, { status: 503, body: { error: { code: 'closed' } } });
      assert.equal(captured.request.complete, true);
      assert.equal(create.mock.callCount(), 0);
      assert.deepEqual(port.commands, []);
      assert.deepEqual([...port.emitters.keys()], ['s']);
      assert.deepEqual(port.stops, ['s']);
    } finally {
      emit.mock.restore();
      pending.destroy();
      gate.resolve({ kind: 'confirmed' });
      await (closing ?? api.daemon.close());
      await response.catch(() => {});
    }
  });
}

test('daemon public close and HTTP shutdown share one pending port cleanup', async t => {
  const port = new FakePort();
  const gate = deferred<PortOutcome>();
  const entered = deferred<void>();
  port.stop = id => { port.stops.push(id); entered.resolve(); return gate.promise; };
  t.after(() => gate.resolve({ kind: 'confirmed' }));
  const api = await apiFixture(t, port);
  await api.running();
  const shutdown = api.request('/shutdown', {});
  try {
    await entered.promise;
    const closes = [api.daemon.close(), api.daemon.close()];
    assert.deepEqual(port.stops, ['s']);
    gate.resolve({ kind: 'confirmed' });
    const summary = { stoppedSessionIds: ['s'], uncertainSessionIds: [], failedSessionIds: [] };
    assert.deepEqual(await shutdown, summary);
    for (const close of closes) assert.deepEqual(await close, summary);
    await api.daemon.closed;
    assert.deepEqual(await api.daemon.close(), summary);
    assert.deepEqual(port.stops, ['s']);
  } finally {
    gate.resolve({ kind: 'confirmed' });
    await api.daemon.close();
    await shutdown;
  }
});
