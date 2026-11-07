import assert from 'node:assert/strict';
import test from 'node:test';
import { SessionCore, type NativeResponse, type PortOutcome } from '../src/core.ts';
import { deferred, FakePort, rejectsCode } from './fake-port.ts';

const states = ['starting', 'starting-ack', 'running', 'pending-command'] as const;
const outcomes = ['confirmed', 'rejected', 'unknown', 'throw'] as const;

for (const state of states) {
  for (const first of ['unknown', 'throw'] as const) {
    for (const cleanup of ['stop', 'shutdown'] as const) {
      for (const next of outcomes) {
        test(`${state}: ${first} stop then explicit ${cleanup} returning ${next}`, async () => {
          const port = new FakePort();
          const core = new SessionCore(port);
          const startResult = deferred<PortOutcome>();
          const commandResult = deferred<NativeResponse | null>();
          const firstStop = deferred<PortOutcome>();
          core.create('s');
          if (state.startsWith('starting')) {
            port.start = async (id, emit) => {
              port.emitters.set(id, emit);
              return startResult.promise;
            };
          }
          const startTask = core.start('s');
          if (!state.startsWith('starting')) await startTask;
          port.commandOperation = () => commandResult.promise;
          const commandTask = state === 'pending-command'
            ? rejectsCode(core.command('s', { type: 'prompt', message: 'private' }), 'harness-unknown') : null;
          port.stop = async (id) => {
            port.stops.push(id);
            if (port.stops.length === 1) {
              await firstStop.promise;
              if (first === 'throw') throw new Error('private');
              return { kind: 'unknown' };
            }
            if (next === 'throw') throw new Error('private');
            return { kind: next };
          };
          const stopTask = rejectsCode(core.stop('s'), 'harness-unknown');
          if (state === 'starting-ack') {
            startResult.resolve({ kind: 'confirmed' });
            assert.equal((await startTask).status, 'starting');
          }
          firstStop.resolve({ kind: 'confirmed' });
          await stopTask;
          assert.deepEqual(port.stops, ['s']); // No automatic retry.
          assert.equal(core.get('s').status, 'unknown');
          await rejectsCode(core.command('s', { type: 'prompt', message: 'private' }), 'invalid-state');
          const events: unknown[] = [];
          core.subscribe((event) => events.push(event));
          if (cleanup === 'shutdown') {
            const result = await core.shutdown();
            assert.deepEqual(result, {
              stoppedSessionIds: next === 'confirmed' ? ['s'] : [],
              uncertainSessionIds: next === 'unknown' || next === 'throw' ? ['s'] : [],
              failedSessionIds: next === 'rejected' ? ['s'] : [],
            });
          } else {
            if (next === 'confirmed') assert.equal((await core.stop('s')).status, 'stopped');
            else await rejectsCode(core.stop('s'), next === 'rejected' ? 'harness-rejected' : 'harness-unknown');
            assert.equal(core.get('s').status, next === 'confirmed' ? 'stopped' : 'unknown');
            await rejectsCode(core.command('s', { type: 'prompt', message: 'private' }), 'invalid-state');
          }
          assert.deepEqual(port.stops, ['s', 's']);
          const eventCount = events.length;
          port.emit('s', { type: 'text', text: 'stale' });
          startResult.resolve({ kind: 'confirmed' });
          const startView = await startTask;
          if (state === 'starting') assert.notEqual(startView.status, 'running');
          commandResult.resolve(null);
          if (commandTask) await commandTask;
          assert.equal(events.length, eventCount);
          assert.deepEqual(port.stops, ['s', 's']);
        });
      }
    }
  }
}
