import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NativeResponse } from '../src/types.ts';
import type { ApiStream } from './api-client.mjs';
import { apiFixture } from './api-support.ts';
import { FakePort, deferred } from './fake-port.ts';

test('api command disconnect: no cancellation/retry/stop or SSE history replay', async t => {
  const port = new FakePort();
  const api = await apiFixture(t, port);
  const entered = deferred<void>(), gate = deferred<NativeResponse>(), finished = deferred<void>();
  const nativeResponse: NativeResponse = { type: 'response', id: 'held-id', command: 'prompt',
    success: true, data: { disposition: 'handled' }, optionalMetadata: { preserved: true } };
  port.commandOperation = async () => {
    entered.resolve();
    const response = await gate.promise;
    finished.resolve();
    return response;
  };
  const controller = new AbortController();
  let initial: ApiStream | undefined, reconnected: ApiStream | undefined;
  let request: Promise<Response> | undefined;
  try {
    initial = await api.stream();
    await api.running();
    port.emit('s', { type: 'text', text: 'before-disconnect' });
    await initial.next(f => f.event === 'core' && f.data.type === 'text' && f.data.text === 'before-disconnect');
    const command = { type: 'prompt', message: 'held', streamingBehavior: 'followUp' };
    request = fetch(api.base + '/sessions/s/command', { method: 'POST',
      headers: { ...api.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(command), signal: controller.signal });
    await entered.promise;
    const disconnected = assert.rejects(request, { name: 'AbortError' });
    controller.abort();
    await disconnected;
    await initial.close();
    assert.deepEqual(await api.request('/sessions/s'), { sessionId: 's', status: 'running' });
    assert.deepEqual(port.commands, [{ sessionId: 's', command }]);
    assert.deepEqual(port.stops, []);

    port.emit('s', { type: 'text', text: 'while-disconnected' });
    gate.resolve(nativeResponse);
    await finished.promise;
    assert.deepEqual(await api.request('/sessions/s'), { sessionId: 's', status: 'running' });
    assert.deepEqual(port.commands, [{ sessionId: 's', command }]);
    assert.deepEqual(port.stops, []);

    reconnected = await api.stream();
    const ready = { event: 'ready', data: {} };
    assert.deepEqual(reconnected.events, [ready]);
    const future = { type: 'text' as const, sessionId: 's', text: 'future-only' };
    port.emit('s', { type: 'text', text: future.text });
    await reconnected.next(f => f.event === 'core' && f.data.type === 'text' && f.data.text === future.text);
    const stopped = await api.request('/sessions/s/stop', {});
    await reconnected.next(f => f.event === 'core' && f.data.type === 'session' && f.data.session.status === 'stopped');
    // The later stop frame is a FIFO delivery barrier: history or duplicate markers cannot hide behind ready.
    assert.deepEqual(reconnected.events, [ready, { event: 'core', data: future },
      { event: 'core', data: { type: 'session', session: stopped } }]);
    assert.deepEqual(port.commands, [{ sessionId: 's', command }]);
    assert.deepEqual(port.stops, ['s']);
    assert.deepEqual(await api.request('/shutdown', {}), {
      stoppedSessionIds: [], uncertainSessionIds: [], failedSessionIds: [],
    });
    await api.daemon.closed;
  } finally {
    const settled = request && Promise.allSettled([request]);
    gate.resolve(nativeResponse);
    controller.abort();
    await initial?.close();
    await reconnected?.close();
    await settled;
  }
});
