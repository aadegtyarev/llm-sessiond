import assert from 'node:assert/strict';
import test from 'node:test';
import { CoreError, SessionCore, type PortOutcome } from '../src/core.ts';
import { FakePort, rejectsCode, running } from './fake-port.ts';

test('distinguishes definitive and unknown send failures without retrying', async () => {
  const { core, port } = await running();
  const outcomes: Array<() => Promise<PortOutcome>> = [
    async () => ({ kind: 'rejected' }),
    async () => ({ kind: 'unknown' }),
    async () => { throw new Error('private adapter reason'); },
  ];
  port.sendOperation = () => outcomes.shift()?.() ?? Promise.resolve({ kind: 'confirmed' });
  assert.equal((await core.send('s1', 'i1', 'one')).status, 'failed');
  assert.equal((await core.send('s1', 'i2', 'two')).status, 'unknown');
  await rejectsCode(core.send('s1', 'i3', 'blocked while uncertain'), 'input-in-flight');
  port.emit('s1', { type: 'input-completed', inputId: 'i2' });
  assert.equal((await core.send('s1', 'i3', 'three')).status, 'unknown');
  assert.equal(port.sends.length, 3);
});

test('shutdown closes operations and reports only confirmed stops as stopped', async () => {
  const port = new FakePort();
  const core = new SessionCore(port);
  core.create('confirmed');
  core.create('uncertain');
  core.create('rejected');
  await core.start('confirmed');
  await core.start('uncertain');
  await core.start('rejected');
  port.stop = async (sessionId) => {
    port.stops.push(sessionId);
    if (sessionId === 'confirmed') return { kind: 'confirmed' };
    return { kind: sessionId === 'uncertain' ? 'unknown' : 'rejected' };
  };
  const result = await core.shutdown();
  assert.deepEqual(result.stoppedSessionIds, ['confirmed']);
  assert.deepEqual(result.uncertainSessionIds, ['uncertain']);
  assert.deepEqual(result.failedSessionIds, ['rejected']);
  assert.equal(port.stops.length, 3);
  await assert.rejects(async () => core.list(), (error: unknown) => error instanceof CoreError && error.code === 'closed');
  await rejectsCode(core.start('confirmed'), 'closed');
  assert.equal(core.shutdown(), core.shutdown());
});

test('isolates observer exceptions and exposes no submitted text or adapter exception', async () => {
  const { core, port } = await running();
  const seen: string[] = [];
  core.subscribe(() => { throw new Error('subscriber secret'); });
  core.subscribe((event) => seen.push(JSON.stringify(event)));
  port.sendOperation = async () => { throw new Error('adapter secret'); };
  const result = await core.send('s1', 'i-secret', 'prompt secret');
  assert.equal(result.status, 'unknown');
  assert.ok(seen.length > 0);
  assert.ok(seen.some((event) => event.includes('i-secret')));
  assert.ok(seen.every((event) => !event.includes('prompt secret') && !event.includes('adapter secret')));
  assert.ok(seen.every((event) => !event.includes('subscriber secret')));
});

test('rejects reused input identifiers so stale terminals cannot settle later inputs', async () => {
  const { core, port } = await running();
  await core.send('s1', 'same', 'first');
  port.emit('s1', { type: 'input-completed', inputId: 'same' });
  await rejectsCode(core.send('s1', 'same', 'second'), 'duplicate-input');
  assert.equal(port.sends.length, 1);
});
