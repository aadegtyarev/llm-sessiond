import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Socket } from 'node:net';
import { SessionCore, type CoreEvent, type InputView, type ReplyOutcome } from '../src/core.ts';
import { createPiHarness } from '../src/pi-harness.ts';
import { phaseTrace, until } from './pi-observation.ts';

type Query = 'models' | 'settings';
type Action = 'question' | 'completed' | 'cancelled';
async function fixture(t: TestContext, query: Query, action: Action, foreign: boolean | 'query' = false) {
  const trace = phaseTrace();
  const port = createPiHarness({ executable: process.execPath, prefixArgs: [fileURLToPath(new URL('./pi-readonly-child.ts', import.meta.url)),
    query, action, ...(foreign ? [foreign === 'query' ? '--foreign-in-query' : '--foreign'] : []), trace.flag], commandDeadlineMs: 5_000, stopDeadlineMs: 2_000 });
  const core = new SessionCore(port), events: CoreEvent[] = [];
  core.subscribe(event => events.push(event));
  t.after(async () => {
    try {
      const result = await core.shutdown();
      assert.deepEqual(result.uncertainSessionIds, []); assert.deepEqual(result.failedSessionIds, []);
      assert.equal(trace.phases().includes('fixture-failed'), false, 'causal actor health');
    } finally { trace.cleanup(); }
  });
  const phase = (name: string) => until(() => trace.phases().includes(name), `child ${name}`);
  const ready = (id: string) => until(() => events.some(event => event.type === 'tool' && event.toolCallId === `${id}-ready`), `owned ${id} boundary`);
  core.create('s'); await core.start('s');
  const first = await core.send('s', 'A', 'A'); await ready('A');
  return { core, port, events, first, phase, ready, release: trace.release, phases: trace.phases };
}

for (const query of ['models', 'settings'] as const) {
  for (const action of ['question', 'completed', 'cancelled'] as const) {
    test(`pi-readonly: ${query} held through ${action} permits exact subscriber reply/send B`, async t => {
      const f = await fixture(t, query, action);
      let next: Promise<InputView | string> | undefined, answer: Promise<ReplyOutcome | string> | undefined;
      f.core.subscribe(event => {
        if (action === 'question' && event.type === 'question') {
          answer = f.core.reply('s', { requestId: event.question.requestId, method: 'confirm', confirmed: true }).catch(error => error.code);
        } else if (event.type === 'input' && event.input.inputId === 'A' && event.input.status === action) {
          next = f.core.send('s', 'B', 'B').catch(error => error.code);
        }
      });
      const read = f.core[query]('s'); await f.phase('query-held');
      // Both Core and owned adapter must preserve exclusive effectful controls.
      for (const operation of [() => f.core.setModel('s', { provider: 'fixture', modelId: 'one' }),
        () => f.core.setThinkingLevel('s', 'low'), () => f.core.reload('s'), () => f.core.settings('s')]) {
        await assert.rejects(operation());
      }
      assert.deepEqual(await f.port.setModel!('s', { provider: 'fixture', modelId: 'one' }), { kind: 'rejected' });
      assert.deepEqual(await f.port.setThinkingLevel!('s', 'low'), { kind: 'rejected' });
      assert.deepEqual(await f.port.reload!('s'), { kind: 'rejected' });
      f.release('event'); await f.phase('event-published');
      let cancel: Promise<InputView> | undefined;
      if (action === 'cancelled') {
        cancel = f.core.cancel('s', 'A');
        await f.phase('abort-settled');
        assert.equal(next, undefined); assert.equal(f.core.get('s').input?.status, 'pending');
        f.release('abort-ack');
        assert.deepEqual(await cancel, { inputId: 'A', status: 'cancelled' });
      }
      if (action === 'question') {
        await until(() => answer !== undefined, 'immediate reply subscriber');
        assert.deepEqual(await answer, { kind: 'written' }); await f.phase('ui-confirmed');
        assert.deepEqual(await f.core.reply('s', { requestId: 'q', method: 'confirm', confirmed: true }), { kind: 'rejected' });
        assert.equal(f.core.get('s').input?.status, 'pending');
      } else {
        await until(() => next !== undefined, 'immediate next-send subscriber');
        assert.deepEqual(await next, { inputId: 'B', status: 'pending' }); await f.ready('B'); await f.phase('late-A');
        assert.deepEqual(f.core.get('s').input, { inputId: 'B', status: 'pending' });
        assert.deepEqual(f.first, { inputId: 'A', status: 'pending' });
        if (cancel) assert.deepEqual(await cancel, { inputId: 'A', status: 'cancelled' });
      }
      f.release('query-result'); assert.deepEqual(await read, { kind: 'unknown' });
      assert.equal(f.core.get('s').status, 'running');
      assert.equal(JSON.stringify(f.events).includes('secret'), false);
      if (action !== 'question') {
        f.release('B-terminal');
        await until(() => f.core.get('s').input?.status === 'completed', 'B own terminal');
        assert.deepEqual(f.core.get('s').input, { inputId: 'B', status: 'completed' });
        assert.equal(f.phases().filter(phase => phase === 'prompt:B').length, 1);
      }
      assert.equal(f.phases().filter(phase => phase === 'prompt:A').length, 1);
      assert.equal(f.phases().filter(phase => phase === 'query-result').length, 1);
    });
  }
}

for (const query of ['models', 'settings'] as const) {
  test(`pi-readonly: ${query} cancelled publication also waits for abort LOCAL write drain`, async t => {
    const f = await fixture(t, query, 'cancelled');
    let next: Promise<InputView | string> | undefined, drain: (() => void) | undefined;
    f.core.subscribe(event => {
      if (event.type === 'input' && event.input.inputId === 'A' && event.input.status === 'cancelled') {
        next = f.core.send('s', 'B', 'B').catch(error => error.code);
      }
    });
    const write = Socket.prototype.write;
    t.mock.method(Socket.prototype, 'write', function (this: Socket, chunk: string | Uint8Array,
      encoding?: BufferEncoding | ((error?: Error | null) => void), callback?: (error?: Error | null) => void) {
      const complete = typeof encoding === 'function' ? encoding : callback;
      let abort = false;
      if (typeof chunk === 'string') { try { abort = JSON.parse(chunk).type === 'abort'; } catch { /* Not an RPC frame. */ } }
      return write.call(this, chunk, typeof encoding === 'string' ? encoding : 'utf8', error => {
        if (abort && !error) drain = () => complete?.();
        else complete?.(error);
      });
    });
    const read = f.core[query]('s'); await f.phase('query-held');
    const cancel = f.core.cancel('s', 'A');
    await f.phase('abort-settled'); f.release('abort-ack'); await f.phase('abort-ack');
    await until(() => f.events.some(event => event.type === 'notification' && event.method === 'notify'
      && event.message === 'abort-ack-observed'), 'host consumed FIFO marker AFTER abort ACK');
    await until(() => drain !== undefined, 'actual abort local callback held');
    try {
      assert.equal(next, undefined); assert.equal(f.core.get('s').input?.status, 'pending');
    } finally { drain?.(); }
    assert.deepEqual(await cancel, { inputId: 'A', status: 'cancelled' });
    assert.deepEqual(await next, { inputId: 'B', status: 'pending' }); await f.ready('B');
    f.release('query-result'); assert.deepEqual(await read, { kind: 'unknown' });
    assert.deepEqual(f.core.get('s').input, { inputId: 'B', status: 'pending' });
  });
}

for (const action of ['question', 'completed'] as const) {
  test(`pi-readonly: interleaved ${action} cannot hide ownership loss in the SAME settings query`, async t => {
    const f = await fixture(t, 'settings', action, 'query');
    let reentry: Promise<InputView | ReplyOutcome | string> | undefined;
    f.core.subscribe(event => {
      if (event.type === 'question') reentry = f.core.reply('s', { requestId: 'q', method: 'confirm', confirmed: true }).catch(error => error.code);
      if (event.type === 'input' && event.input.inputId === 'A' && event.input.status === 'completed') reentry = f.core.send('s', 'B', 'B').catch(error => error.code);
    });
    const read = f.core.settings('s'); await f.phase('query-held'); f.release('event');
    await until(() => reentry !== undefined, 'ordinary reentry before foreign ACK');
    assert.deepEqual(await reentry, action === 'question' ? { kind: 'written' } : { inputId: 'B', status: 'pending' });
    if (action === 'completed') await f.ready('B'); else await f.phase('ui-confirmed');
    f.release('query-result'); assert.deepEqual(await read, { kind: 'unknown' }); await f.phase('foreign');
    const inputId = action === 'question' ? 'A' : 'B';
    assert.equal(f.core.get('s').status, 'unknown');
    assert.deepEqual(f.core.get('s').input, { inputId, status: 'unknown' });
    assert.equal(f.events.filter(event => event.type === 'input' && event.input.inputId === inputId && event.input.status === 'unknown').length, 1);
    assert.equal(f.events.some(event => event.type === 'text' && event.text === 'foreign-must-not-forward'), false);
    await assert.rejects(f.core.send('s', 'C', 'C'));
  });
}

for (const query of ['models', 'settings'] as const) {
  test(`pi-readonly: ${query} idle query excludes mutators but permits ordinary send`, async t => {
    const f = await fixture(t, query, 'completed');
    const read = f.core[query]('s'); await f.phase('query-held'); f.release('event');
    await until(() => f.core.get('s').input?.status === 'completed', 'A terminal while query held');
    assert.deepEqual(await f.port.setModel!('s', { provider: 'fixture', modelId: 'one' }), { kind: 'rejected' });
    assert.deepEqual(await f.port.setThinkingLevel!('s', 'low'), { kind: 'rejected' });
    assert.deepEqual(await f.port.reload!('s'), { kind: 'rejected' });
    assert.deepEqual(await f.core.send('s', 'B', 'B'), { inputId: 'B', status: 'pending' }); await f.ready('B');
    f.release('query-result'); assert.deepEqual(await read, { kind: 'unknown' });
    assert.equal(f.core.get('s').status, 'running');
  });

  test(`pi-readonly: ${query} stop drains held read without reopening admission or changing old result`, async t => {
    const f = await fixture(t, query, 'question');
    const read = f.core[query]('s'); await f.phase('query-held');
    assert.equal((await f.core.stop('s')).status, 'stopped');
    assert.deepEqual(await read, { kind: 'unknown' });
    assert.deepEqual(f.first, { inputId: 'A', status: 'pending' });
    assert.deepEqual(f.core.get('s').input, { inputId: 'A', status: 'unknown' });
    await assert.rejects(f.core.send('s', 'B', 'B'));
    assert.equal(f.phases().includes('prompt:B'), false);
  });

  test(`pi-readonly: ${query} reentry B still becomes unknown once on OTHER identity before foreign frames`, async t => {
    const f = await fixture(t, query, 'completed', true);
    let next: Promise<InputView | string> | undefined;
    f.core.subscribe(event => {
      if (event.type === 'input' && event.input.inputId === 'A' && event.input.status === 'completed') {
        next = f.core.send('s', 'B', 'B').catch(error => error.code);
      }
    });
    const read = f.core[query]('s'); await f.phase('query-held'); f.release('event');
    await until(() => next !== undefined, 'B subscriber');
    assert.deepEqual(await next, { inputId: 'B', status: 'pending' }); await f.ready('B');
    f.release('query-result'); assert.deepEqual(await read, { kind: 'unknown' });
    assert.deepEqual(await f.core.settings('s'), { kind: 'unknown' }); await f.phase('foreign');
    assert.equal(f.core.get('s').status, 'unknown');
    assert.deepEqual(f.core.get('s').input, { inputId: 'B', status: 'unknown' });
    assert.equal(f.events.filter(event => event.type === 'input' && event.input.inputId === 'B' && event.input.status === 'unknown').length, 1);
    assert.equal(f.events.some(event => event.type === 'text' && event.text === 'foreign-must-not-forward'), false);
    await assert.rejects(f.core.send('s', 'C', 'C'));
    assert.equal(f.phases().includes('prompt:C'), false);
  });
}
