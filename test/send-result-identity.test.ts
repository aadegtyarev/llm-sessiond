import assert from 'node:assert/strict';
import test from 'node:test';
import { type PortOutcome } from '../src/core.ts';
import { deferred, running } from './fake-port.ts';

for (const terminal of ['completed', 'failed'] as const) {
  for (const lateAck of ['confirmed', 'rejected', 'unknown', 'throw'] as const) {
    test(`${terminal} input result stays with its own send after ${lateAck} ACK`, async () => {
      const { core, port } = await running();
      const firstAck = deferred<PortOutcome>();
      const secondAck = deferred<PortOutcome>();
      const firstResult = lateAck === 'throw' ? Promise.reject(new Error('private late error')) : firstAck.promise;
      let sends = 0;
      port.sendOperation = () => sends++ === 0 ? firstResult : secondAck.promise;
      const first = core.send('s1', 'i1', 'first body');
      port.emit('s1', terminal === 'completed'
        ? { type: 'input-completed', inputId: 'i1' }
        : { type: 'input-failed', inputId: 'i1', certainty: 'definitive' });
      const second = core.send('s1', 'i2', 'second body');
      assert.deepEqual(core.get('s1').input, { inputId: 'i2', status: 'pending' });
      if (lateAck !== 'throw') firstAck.resolve({ kind: lateAck });
      assert.deepEqual(await first, { inputId: 'i1', status: terminal });
      assert.deepEqual(core.get('s1').input, { inputId: 'i2', status: 'pending' });
      secondAck.resolve({ kind: 'confirmed' });
      assert.deepEqual(await second, { inputId: 'i2', status: 'pending' });
    });
  }
}
