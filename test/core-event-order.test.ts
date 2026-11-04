import assert from 'node:assert/strict';
import test from 'node:test';
import { SessionCore, type CoreEvent } from '../src/core.ts';
import { FakePort, running } from './fake-port.ts';

function label(event: CoreEvent): string {
  if (event.type === 'session') return `${event.session.sessionId}:${event.session.status}`;
  if (event.type === 'input') return `${event.sessionId}:${event.input.status}`;
  return `${event.sessionId}:text`;
}

test('core: reentrant start delivers created before starting to both observers', async () => {
  const core = new SessionCore(new FakePort());
  const seen: string[] = [];
  let startTask: Promise<unknown> | undefined;
  core.subscribe((event) => {
    seen.push(`A:${label(event)}`);
    if (event.type === 'session' && event.session.status === 'created') startTask = core.start('s');
  });
  core.subscribe((event) => { seen.push(`B:${label(event)}`); });
  core.create('s');
  assert.deepEqual(seen, ['A:s:created', 'B:s:created', 'A:s:starting', 'B:s:starting']);
  await startTask;
  assert.deepEqual(seen.slice(4), ['A:s:running', 'B:s:running']);
});

test('core: pending precedes reentrant completed and cross-session text for every observer', async () => {
  const { core, port } = await running();
  core.create('s2');
  await core.start('s2');
  const seen: string[] = [];
  core.subscribe((event) => {
    seen.push(`A:${label(event)}`);
    if (event.type === 'input' && event.input.status === 'pending') {
      port.emit('s1', { type: 'input-completed', inputId: event.input.inputId });
      port.emit('s2', { type: 'text', text: 'other session' });
      port.emit('s1', { type: 'text', text: 'same session' });
    }
  });
  core.subscribe((event) => { seen.push(`B:${label(event)}`); });
  const result = await core.send('s1', 'i', 'private prompt');
  assert.deepEqual(seen, [
    'A:s1:pending', 'B:s1:pending', 'A:s1:completed', 'B:s1:completed',
    'A:s2:text', 'B:s2:text', 'A:s1:text', 'B:s1:text',
  ]);
  assert.equal(result.status, 'completed');
  assert.equal(core.get('s1').input?.status, 'completed');
});
