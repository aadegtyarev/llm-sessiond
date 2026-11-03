import assert from 'node:assert/strict';
import test from 'node:test';
import { SessionCore, type PortOutcome } from '../src/core.ts';
import { deferred, FakePort, rejectsCode, running } from './fake-port.ts';

test('creates, starts, sends text, observes output and terminal result, then confirms stop', async () => {
  const { core, port } = await running();
  const events: unknown[] = [];
  core.subscribe((event) => events.push(event));
  assert.equal(core.get('s1').status, 'running');
  const ack = await core.send('s1', 'i1', 'private prompt');
  assert.equal(ack.status, 'pending');
  assert.equal(core.get('s1').input?.status, 'pending');
  port.emit('s1', { type: 'text', text: 'public output' });
  port.emit('s1', { type: 'input-completed', inputId: 'i1' });
  assert.equal(core.get('s1').input?.status, 'completed');
  assert.ok(events.some((event) => JSON.stringify(event).includes('public output')));
  assert.equal((await core.stop('s1')).status, 'stopped');
});

test('enforces one unfinished input and preserves an early terminal result over late ACK', async () => {
  const { core, port } = await running();
  const ack = deferred<PortOutcome>();
  port.sendOperation = () => ack.promise;
  const send = core.send('s1', 'i1', 'not public');
  assert.equal(core.get('s1').input?.status, 'pending');
  await rejectsCode(core.send('s1', 'i2', 'second'), 'input-in-flight');
  port.emit('s1', { type: 'input-completed', inputId: 'i1' });
  ack.resolve({ kind: 'confirmed' });
  assert.equal((await send).status, 'completed');
  assert.equal(core.get('s1').input?.status, 'completed');
});

test('isolates session inputs and ignores events from a confirmed-stopped source', async () => {
  const port = new FakePort();
  const core = new SessionCore(port);
  core.create('a');
  core.create('b');
  await core.start('a');
  await core.start('b');
  await core.send('a', 'ia', 'a body');
  await core.send('b', 'ib', 'b body');
  port.emit('a', { type: 'input-completed', inputId: 'ib' });
  assert.equal(core.get('a').input?.status, 'pending');
  assert.equal(core.get('b').input?.status, 'pending');
  await core.stop('a');
  port.emit('a', { type: 'input-completed', inputId: 'ia' });
  port.emit('a', { type: 'text', text: 'stale output' });
  assert.equal(core.get('a').input?.status, 'unknown');
  assert.equal(core.get('b').input?.status, 'pending');
});
