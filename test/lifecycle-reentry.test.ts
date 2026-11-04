import assert from 'node:assert/strict';
import test from 'node:test';
import { SessionCore, type PortOutcome } from '../src/core.ts';
import { deferred, FakePort } from './fake-port.ts';

test('shutdown reentry during local cleanup shares its in-progress result', async () => {
  const port = new FakePort();
  const core = new SessionCore(port);
  core.create('created');
  let nestedShutdown: Promise<unknown> | undefined;
  core.subscribe((event) => {
    if (event.type === 'session' && event.session.status === 'stopped') nestedShutdown = core.shutdown();
  });
  const shutdown = core.shutdown();
  assert.deepEqual(await shutdown, { stoppedSessionIds: ['created'], uncertainSessionIds: [], failedSessionIds: [] });
  assert.equal(nestedShutdown, shutdown);
  assert.deepEqual(port.stops, []);
});

for (const operation of ['start', 'send'] as const) {
  for (const shutdown of [false, true]) {
    for (const stopKind of ['confirmed', 'unknown'] as const) {
      test(`${operation} notification reentry via ${shutdown ? 'shutdown' : 'stop'} with ${stopKind} stop`, async () => {
        const port = new FakePort();
        const calls: string[] = [];
        const stopResult = deferred<PortOutcome>();
        const startResult = deferred<PortOutcome>();
        const sendResult = deferred<PortOutcome>();
        const core = new SessionCore(port);
        core.create('s');
        if (operation === 'send') await core.start('s');
        calls.length = 0;
        port.stop = async () => {
          calls.push('stop');
          return stopResult.promise;
        };
        if (operation === 'start') {
          port.start = async (sessionId, emit) => {
            calls.push('start');
            port.emitters.set(sessionId, emit);
            return startResult.promise;
          };
        } else {
          port.send = async () => {
            calls.push('send');
            return sendResult.promise;
          };
        }
        let stopTask: Promise<unknown> | undefined;
        let lastSessionStatus = 'created';
        core.subscribe((event) => {
          if (event.type === 'session') lastSessionStatus = event.session.status;
          const reentry = operation === 'start'
            ? event.type === 'session' && event.session.status === 'starting'
            : event.type === 'input' && event.input.status === 'pending';
          if (!reentry) return;
          stopTask = shutdown ? core.shutdown() : core.stop('s').catch((error: unknown) => error);
        });

        const operationTask = operation === 'start' ? core.start('s') : core.send('s', 'i', 'body');
        await Promise.resolve();
        assert.deepEqual(calls, [operation, 'stop']);
        assert.ok(stopTask);
        let result: unknown;
        if (operation === 'start') {
          startResult.resolve({ kind: 'confirmed' });
          result = await operationTask;
          assert.equal((result as { status: string }).status, 'starting');
          await assert.rejects(core.send('s', 'later', 'during stop intent'));
        } else {
          await assert.rejects(core.send('s', 'i2', 'after stop intent'));
        }
        assert.deepEqual(calls, [operation, 'stop']);
        stopResult.resolve({ kind: stopKind });
        const stopReport = await stopTask;
        if (shutdown) {
          const report = stopReport as { stoppedSessionIds: string[]; uncertainSessionIds: string[] };
          assert.deepEqual(report.stoppedSessionIds, stopKind === 'confirmed' ? ['s'] : []);
          assert.deepEqual(report.uncertainSessionIds, stopKind === 'unknown' ? ['s'] : []);
        } else if (stopKind === 'unknown') {
          assert.equal((stopReport as { code?: string }).code, 'harness-unknown');
        }
        if (operation === 'send') {
          sendResult.resolve({ kind: 'confirmed' });
          result = await operationTask;
          assert.deepEqual(result, { inputId: 'i', status: 'unknown' });
        }
        const expectedSessionStatus = stopKind === 'confirmed' ? 'stopped' : 'unknown';
        assert.equal(shutdown ? lastSessionStatus : core.get('s').status, expectedSessionStatus);
        assert.deepEqual(calls, [operation, 'stop']);
      });
    }
  }
}
