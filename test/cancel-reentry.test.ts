import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SessionCore, type InputView, type PortOutcome } from '../src/core.ts';
import { FakePort, deferred, rejectsCode } from './fake-port.ts';
import { fixtureHealth } from './pi-fixture-health.ts';

for (const mode of ['same', 'different'] as const) {
  test(`cancel reentry: ${mode} listener immediately sends B at verified cancelled`, async () => {
    const raw = new FakePort();
    const ack = deferred<PortOutcome>();
    const health = fixtureHealth();
    const calls: string[] = [];
    const port = Object.assign(raw, { cancel: async (): Promise<PortOutcome> => {
      calls.push('abort'); raw.emit('s', { type: 'input-cancelled', inputId: 'A' });
      return ack.promise;
    } });
    const core = new SessionCore(health.wrap(port));
    core.create('s'); await core.start('s'); await core.send('s', 'A', '');
    const seen: string[] = [];
    let next: Promise<InputView | unknown> | undefined;
    const sendB = () => { next = core.send('s', 'B', '').catch(error => error); };
    core.subscribe(e => {
      if (e.type === 'input' && e.input.status === 'cancelled') {
        seen.push(e.input.inputId);
        if (mode === 'same') sendB();
      }
    });
    if (mode === 'different') core.subscribe(e => {
      if (e.type === 'input' && e.input.status === 'cancelled') sendB();
    });
    let competing: Promise<unknown> | undefined;
    core.subscribe(e => {
      if (e.type === 'input' && e.input.status === 'cancelled') {
        competing = core.send('s', 'C', '').catch(error => error.code);
      }
    });
    const cancel = core.cancel('s', 'A');
    assert.deepEqual(seen, []);
    await rejectsCode(core.send('s', 'premature', ''), 'input-in-flight');
    ack.resolve({ kind: 'confirmed' });
    assert.deepEqual(await cancel, { inputId: 'A', status: 'cancelled' });
    assert.deepEqual(await next, { inputId: 'B', status: 'pending' });
    assert.equal(await competing, 'input-in-flight');
    assert.deepEqual(seen, ['A']);
    assert.deepEqual(calls, ['abort']);
    assert.equal(core.get('s').input?.inputId, 'B');
    health.assertHealthy();
  });
}

for (const status of ['completed', 'failed'] as const) {
  test(`cancel reentry: natural ${status} before late abort ACK keeps B fenced`, async () => {
    const raw = new FakePort();
    const ack = deferred<PortOutcome>();
    const health = fixtureHealth();
    const port = Object.assign(raw, { cancel: async () => ack.promise });
    const core = new SessionCore(health.wrap(port));
    core.create('s'); await core.start('s'); await core.send('s', 'A', '');
    let early: Promise<unknown> | undefined;
    core.subscribe(e => {
      if (e.type === 'input' && e.input.status === status) {
        early = core.send('s', 'B', '').catch(error => error.code);
      }
    });
    const cancel = core.cancel('s', 'A');
    raw.emit('s', status === 'completed' ? { type: 'input-completed', inputId: 'A' }
      : { type: 'input-failed', inputId: 'A', certainty: 'definitive' });
    assert.equal(await early, 'input-in-flight');
    ack.resolve({ kind: 'unknown' });
    assert.deepEqual(await cancel, { inputId: 'A', status });
    await core.send('s', 'B', '');
    raw.emit('s', { type: 'input-cancelled', inputId: 'A' });
    assert.deepEqual(core.get('s').input, { inputId: 'B', status: 'pending' });
    health.assertHealthy();
  });
}
