import assert from 'node:assert/strict';
import test from 'node:test';
import { type PortOutcome } from '../src/core.ts';
import { deferred, rejectsCode, running } from './fake-port.ts';

for (const cleanup of ['stop', 'shutdown'] as const) {
  test(`settled unknown notification permits reentrant ${cleanup}`, async () => {
    const { core, port } = await running();
    let cleanupTask: Promise<unknown> | undefined;
    port.stop = async (id) => {
      port.stops.push(id);
      return { kind: port.stops.length === 1 ? 'unknown' : 'confirmed' };
    };
    core.subscribe((event) => {
      if (event.type === 'session' && event.session.status === 'unknown') {
        cleanupTask = cleanup === 'stop' ? core.stop('s1') : core.shutdown();
      }
    });
    await rejectsCode(core.stop('s1'), 'harness-unknown');
    assert.ok(cleanupTask);
    const result = await cleanupTask;
    if (cleanup === 'stop') assert.equal((result as { status: string }).status, 'stopped');
    else assert.deepEqual(result, { stoppedSessionIds: ['s1'], uncertainSessionIds: [], failedSessionIds: [] });
    assert.deepEqual(port.stops, ['s1', 's1']);
  });

  test(`pending explicit cleanup guards concurrent and port-reentrant ${cleanup}`, async () => {
    const { core, port } = await running();
    port.stop = async (id) => { port.stops.push(id); return { kind: 'unknown' }; };
    await rejectsCode(core.stop('s1'), 'harness-unknown');
    const result = deferred<PortOutcome>();
    let reentry: Promise<void> | undefined;
    port.stop = (id) => {
      port.stops.push(id);
      reentry = rejectsCode(core.stop('s1'), 'harness-unknown');
      return result.promise;
    };
    const cleanupTask = core.stop('s1');
    await reentry;
    await rejectsCode(core.command('s1', { type: 'prompt', message: 'private' }), 'invalid-state');
    if (cleanup === 'stop') await rejectsCode(core.stop('s1'), 'harness-unknown');
    else assert.deepEqual(await core.shutdown(), {
      stoppedSessionIds: [], uncertainSessionIds: ['s1'], failedSessionIds: [],
    });
    assert.deepEqual(port.stops, ['s1', 's1']);
    result.resolve({ kind: 'confirmed' });
    assert.equal((await cleanupTask).status, 'stopped');
    assert.deepEqual(port.stops, ['s1', 's1']);
  });
}

test('rejected stop without prior uncertainty restores command admission', async () => {
  const { core, port } = await running();
  port.stop = async () => ({ kind: 'rejected' });
  await rejectsCode(core.stop('s1'), 'harness-rejected');
  assert.equal(core.get('s1').status, 'running');
  assert.equal((await core.command('s1', { type: 'prompt', message: 'private' })).success, true);
});

test('rejected cleanup after uncertainty still permits a later explicit confirmation', async () => {
  const { core, port } = await running();
  for (const kind of ['unknown', 'rejected', 'confirmed'] as const) {
    port.stop = async (id) => { port.stops.push(id); return { kind }; };
    if (kind === 'confirmed') assert.equal((await core.stop('s1')).status, 'stopped');
    else await rejectsCode(core.stop('s1'), kind === 'unknown' ? 'harness-unknown' : 'harness-rejected');
    await rejectsCode(core.command('s1', { type: 'prompt', message: 'private' }), 'invalid-state');
  }
  assert.deepEqual(port.stops, ['s1', 's1', 's1']);
});
