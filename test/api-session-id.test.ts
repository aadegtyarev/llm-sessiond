import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FakePort } from './fake-port.ts';
import { apiFixture } from './api-support.ts';

for (const id of ['.', '..']) {
  test(`daemon rejects URL-normalized session ID ${id} before state/events/Port effects`, async t => {
    const port = new FakePort();
    const api = await apiFixture(t, port);
    const stream = await api.stream();
    t.after(() => stream.close());
    assert.deepEqual(await api.request('/sessions', { sessionId: id }, 400), { error: { code: 'schema' } });
    assert.deepEqual(await api.request('/sessions'), []);
    // Observing this later session event is a causal delivery barrier, not a sleep.
    const sentinel = await api.request('/sessions', { sessionId: 'fence.session' });
    await stream.next(f => f.event === 'core' && f.data.type === 'session' && f.data.session.sessionId === 'fence.session');
    assert.deepEqual(stream.events, [{ event: 'ready', data: {} },
      { event: 'core', data: { type: 'session', session: sentinel } }]);
    assert.deepEqual(await api.request('/sessions'), [sentinel]);
    assert.equal(port.emitters.size, 0);
    assert.deepEqual(port.commands, []);
    assert.deepEqual(port.stops, []);
  });
}

for (const id of ['.prefix', 'suffix.', 'a..b', '...', '._-']) {
  test(`daemon dot-containing session ID ${id} stays addressable for Native commands`, async t => {
    const port = new FakePort();
    const api = await apiFixture(t, port);
    const stream = await api.stream();
    t.after(() => stream.close());
    assert.equal((await api.running(id)).sessionId, id);
    assert.equal((await api.request(`/sessions/${id}`)).status, 'running');
    for (const message of ['.', '..']) {
      assert.equal((await api.request(`/sessions/${id}/command`, { type: 'prompt', message })).success, true);
    }
    assert.deepEqual(port.commands.map(call => call.command.message), ['.', '..']);
    assert.equal((await api.request(`/sessions/${id}/stop`, {})).status, 'stopped');
  });
}
