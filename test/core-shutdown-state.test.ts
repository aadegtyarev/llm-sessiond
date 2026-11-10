import assert from 'node:assert/strict';
import test from 'node:test';
import { CoreError, SessionCore, type PortOutcome } from '../src/core.ts';
import { FakePort, deferred, rejectsCode } from './fake-port.ts';

const summary = { stoppedSessionIds: ['running'], uncertainSessionIds: [], failedSessionIds: [] };

// Shutdown admission must close synchronously, before the deferred cleanup starts.
test('SessionCore.shutdown immediately closes all eight operations before its first microtask', async t => {
  const port = new FakePort();
  const start = t.mock.method(port, 'start');
  const command = t.mock.method(port, 'command');
  let replies = 0;
  const gate = deferred<PortOutcome>();
  const entered = deferred<void>();
  port.stop = id => { port.stops.push(id); entered.resolve(); return gate.promise; };
  const core = new SessionCore({
    start: port.start.bind(port), command: port.command.bind(port), stop: port.stop.bind(port),
    async reply() { replies++; return { kind: 'written' }; },
  });
  core.create('running');
  await core.start('running');
  core.create('created');
  let shutdown: ReturnType<SessionCore['shutdown']> | undefined;
  try {
    shutdown = core.shutdown();
    assert.equal(core.shutdown(), shutdown);
    assert.deepEqual(port.stops, []);
    const syncOperations = {
      create: () => core.create('late'),
      get: () => core.get('running'),
      list: () => core.list(),
      subscribe: () => core.subscribe(() => {}),
    };
    for (const [name, operation] of Object.entries(syncOperations)) {
      assert.throws(operation, error => error instanceof CoreError && error.code === 'closed', name);
    }
    const asyncOperations = {
      start: () => core.start('created'),
      command: () => core.command('running', { type: 'future', extra: true }),
      reply: () => core.reply('running', { requestId: 'q', method: 'input', value: '' }),
      stop: () => core.stop('running'),
    };
    const rejected = Object.values(asyncOperations).map(operation => rejectsCode(operation(), 'closed'));
    // All admissions above ran before any await, with no port cleanup or operation effects.
    assert.deepEqual(port.stops, []);
    assert.equal(start.mock.callCount(), 1);
    assert.equal(command.mock.callCount(), 0);
    assert.equal(replies, 0);
    await Promise.all(rejected);
    await entered.promise;
    assert.deepEqual(port.stops, ['running']);
    assert.equal(core.shutdown(), shutdown);
    gate.resolve({ kind: 'confirmed' });
    assert.deepEqual(await shutdown, { ...summary, stoppedSessionIds: ['running', 'created'] });
    assert.equal(core.shutdown(), shutdown);
    assert.deepEqual(port.stops, ['running']);
  } finally {
    gate.resolve({ kind: 'confirmed' });
    await (shutdown ?? core.shutdown());
  }
});

test('SessionCore.shutdown stores one Promise across deferred cleanup, port and subscriber reentry', async () => {
  const port = new FakePort();
  const core = new SessionCore(port);
  core.create('running');
  await core.start('running');
  const gate = deferred<PortOutcome>();
  const entered = deferred<void>();
  const portReentry: ReturnType<SessionCore['shutdown']>[] = [];
  const subscriberReentry: ReturnType<SessionCore['shutdown']>[] = [];
  core.subscribe(event => {
    if (event.type === 'session' && event.session.status === 'stopped') subscriberReentry.push(core.shutdown());
  });
  port.stop = id => {
    port.stops.push(id);
    portReentry.push(core.shutdown());
    entered.resolve();
    return gate.promise;
  };
  const shutdown = core.shutdown();
  try {
    assert.equal(core.shutdown(), shutdown);
    assert.deepEqual(port.stops, []);
    assert.deepEqual(portReentry, []);
    await entered.promise;
    assert.deepEqual(port.stops, ['running']);
    assert.equal(portReentry.length, 1);
    assert.equal(portReentry[0], shutdown);
    assert.equal(core.shutdown(), shutdown);
    assert.deepEqual(subscriberReentry, []);
    gate.resolve({ kind: 'confirmed' });
    const result = await shutdown;
    assert.deepEqual(result, summary);
    assert.equal(subscriberReentry.length, 1);
    assert.equal(subscriberReentry[0], shutdown);
    assert.equal(core.shutdown(), shutdown);
    assert.equal(await core.shutdown(), result);
    assert.deepEqual(port.stops, ['running']);
  } finally {
    gate.resolve({ kind: 'confirmed' });
    await shutdown;
  }
});
