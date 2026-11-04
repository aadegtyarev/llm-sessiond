import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SessionCore } from '../src/core.ts';
import { final, fixture, until } from './pi-support.ts';

test('pi Unicode fragmented CRLF output is session scoped and filtered', async (t) => {
  const f = await fixture(t);
  await f.start();
  await f.send({ fragment: true, records: [
    { type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: 'secret' } },
    { type: 'tool_execution_update', partialResult: 'secret' },
    ...final(),
  ] });
  await until(() => f.events.length === 2);
  assert.deepEqual(f.events, [
    { type: 'text', text: 'Привет 🌍\u2028\u2029' },
    { type: 'input-completed', inputId: 'i' },
  ]);
});

test('pi separate processes and native resource launch defaults', async (t) => {
  const f = await fixture(t);
  await f.start('a');
  await f.start('b');
  await f.send({ inspect: true, records: final() }, 'a-input', 'a');
  await f.send({ inspect: true, records: final() }, 'b-input', 'b');
  await until(() => f.events.length === 4);
  const reports = f.events.filter((e) => e.type === 'text').map((e) => JSON.parse(e.text));
  assert.notEqual(reports[0].pid, reports[1].pid);
  for (const report of reports) {
    assert.equal(report.override, false);
    assert.deepEqual(report.args, ['--mode', 'rpc', '--no-session']);
  }
});

test('pi handled native work can still produce session text, never an input terminal', async (t) => {
  const f = await fixture(t);
  await f.start();
  assert.equal((await f.send({ disposition: 'handled', fragment: true, records: final() })).kind,
    'unknown');
  await until(() => f.events.length > 0);
  assert.deepEqual(f.events, [{ type: 'text', text: 'Привет 🌍\u2028\u2029' }]);
});

test('pi early terminal A and reentrant B preserve original send identity', async (t) => {
  const f = await fixture(t);
  const core = new SessionCore(f.port);
  f.ids.add('s');
  core.create('s');
  await core.start('s');
  let next: ReturnType<typeof core.send> | undefined;
  core.subscribe((event) => {
    if (event.type === 'input' && event.input.inputId === 'A'
      && event.input.status === 'completed') {
      next = core.send('s', 'B', JSON.stringify({ batch: true, records: final() }));
    }
  });
  const first = await core.send('s', 'A', JSON.stringify({ batch: true, records: final() }));
  await until(() => next !== undefined && core.get('s').input?.status === 'completed');
  assert.deepEqual(first, { inputId: 'A', status: 'completed' });
  assert.deepEqual(await next, { inputId: 'B', status: 'completed' });
  assert.deepEqual(core.get('s').input, { inputId: 'B', status: 'completed' });
});
