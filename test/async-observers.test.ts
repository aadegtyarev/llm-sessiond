import assert from 'node:assert/strict';
import test from 'node:test';
import { running } from './fake-port.ts';

test('contains async subscriber rejection before and after await for every public event', async () => {
  const { core, port } = await running();
  const observed: string[] = [];
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  for (const type of ['session', 'input', 'text'] as const) {
    core.subscribe(async (event) => {
      if (event.type === type) throw new Error(`private ${type} before await`);
    });
    core.subscribe(async (event) => {
      if (event.type !== type) return;
      await Promise.resolve();
      throw new Error(`private ${type} after await`);
    });
  }
  core.subscribe((event) => observed.push(event.type));
  try {
    core.create('observer-test');
    await core.start('observer-test');
    await core.send('observer-test', 'i1', 'private prompt');
    port.emit('observer-test', { type: 'text', text: 'public output' });
    port.emit('observer-test', { type: 'input-completed', inputId: 'i1' });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual([...new Set(observed)], ['session', 'input', 'text']);
    assert.deepEqual(unhandled, []);
    assert.equal(core.get('observer-test').input?.status, 'completed');
  } finally {
    process.removeListener('unhandledRejection', onUnhandled);
  }
});
