import assert from 'node:assert/strict';
import test from 'node:test';
import { SessionCore, type CoreEvent, type HarnessEvent, type QuestionReply, type ReplyOutcome } from '../src/core.ts';
import { FakePort, deferred, rejectsCode, running } from './fake-port.ts';
import { interactionEvent } from '../src/pi-interaction-events.ts';
import { dialogs, tools, notifications, answers } from './pi-interaction-records.ts';

for (const record of [...tools, ...dialogs, ...notifications]) {
  test(`interaction-core: immutable ${record.type} ${'method' in record ? record.method : record.type} during startup and idle`, async () => {
    const port = new FakePort();
    const start = deferred<{ kind: 'confirmed' }>();
    port.start = async (id, emit) => { port.emitters.set(id, emit); return start.promise; };
    const core = new SessionCore(port);
    const seen: CoreEvent[] = [];
    core.subscribe(event => seen.push(event));
    core.create('s');
    const starting = core.start('s');
    const observation = interactionEvent(record)!;
    port.emit('s', observation);
    assert.equal(seen.at(-1)?.type, observation.type);
    assert.equal(Object.isFrozen(seen.at(-1)), true);
    assert.deepEqual(core.get('s'), { sessionId: 's', status: 'starting' });
    start.resolve({ kind: 'confirmed' });
    await starting;
    port.emit('s', observation);
    const saved = seen.at(-1)!;
    if (saved.type === 'question' && saved.question.method === 'select') {
      const options = saved.question.options;
      assert.throws(() => (options as string[]).push('changed'));
    }
    const count = seen.length;
    await core.stop('s');
    port.emit('s', observation);
    assert.equal(seen.length, count + 1);
    await core.shutdown();
  });
}

for (const record of [...tools, ...dialogs, ...notifications]) {
  test(`interaction-core: FIFO snapshot/reentry/isolation ${JSON.stringify(record)}`, async () => {
    const { core, port } = await running();
    core.create('s2'); await core.start('s2');
    const seen: string[] = [];
    const titles: string[] = [];
    let removeB = () => {};
    core.subscribe(event => {
      if (event.type === 'session') return;
      seen.push(`A:${event.sessionId}:${event.type}`);
      if (event.sessionId === 's1') {
        const observation = structuredClone(interactionEvent(record)!);
        port.emit('s2', observation);
        // Mutation of the source after enqueue cannot change the public snapshot.
        if (observation.type === 'question') (observation.question as { title: string }).title = 'mutated';
        removeB();
        core.subscribe(e => { if (e.type !== 'session') seen.push(`C:${e.sessionId}`); });
      }
      throw new Error('listener failure');
    });
    removeB = core.subscribe(event => {
      if (event.type === 'session') return;
      seen.push(`B:${event.sessionId}:${event.type}`);
      if (event.type === 'question') titles.push(event.question.title);
      return Promise.reject(new Error('async listener failure'));
    });
    port.emit('s1', interactionEvent(record)!);
    const type = interactionEvent(record)!.type;
    assert.deepEqual(seen, [`A:s1:${type}`, `B:s1:${type}`, `A:s2:${type}`, `B:s2:${type}`]);
    assert.ok(titles.every(title => title !== 'mutated'));
    await core.shutdown();
  });
}

test('interaction-core: reply admission, exceptions and late result', async () => {
  const port = new FakePort();
  const pending = deferred<ReplyOutcome>();
  const calls: [string, QuestionReply][] = [];
  const core = new SessionCore({ ...port, start: port.start.bind(port), command: port.command.bind(port),
    stop: port.stop.bind(port), reply: async (id, reply) => { calls.push([id, reply]); return pending.promise; } });
  core.create('s');
  await rejectsCode(core.reply('s', answers[0]), 'invalid-state');
  await rejectsCode(core.reply('absent', answers[0]), 'session-not-found');
  await core.start('s');
  const result = core.reply('s', answers[0]);
  assert.equal(core.get('s').status, 'running');
  assert.deepEqual(calls, [['s', answers[0]]]);
  await core.stop('s'); pending.resolve({ kind: 'written' });
  assert.deepEqual(await result, { kind: 'unknown' });
  await rejectsCode(core.reply('s', answers[0]), 'invalid-state');
  await core.shutdown();
  await rejectsCode(core.reply('s', answers[0]), 'closed');
  const other = await running();
  assert.deepEqual(await other.core.reply('s1', answers[0]), { kind: 'rejected' });
  await other.core.shutdown();
});

test('interaction-core: reply exception is unknown, not Native consumption', async () => {
  const port = new FakePort();
  const core = new SessionCore({ start: port.start.bind(port), command: port.command.bind(port),
    stop: port.stop.bind(port), reply: async () => { throw new Error('private'); } });
  core.create('s'); await core.start('s');
  assert.deepEqual(await core.reply('s', answers[0]), { kind: 'unknown' });
  assert.deepEqual(core.get('s'), { sessionId: 's', status: 'running' });
  await core.shutdown();
});
