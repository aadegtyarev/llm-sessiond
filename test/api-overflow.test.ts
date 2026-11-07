import assert from 'node:assert/strict';
import { request } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { test } from 'node:test';
import { apiFixture } from './api-support.ts';
import { FakePort } from './fake-port.ts';

// A paused TCP consumer competes with an actively reading HTTP/SSE consumer.
test('daemon TCP stream overflow closes only the slow consumer; Core and fast stream stay usable', async t => {
  const port = new FakePort();
  const api = await apiFixture(t, port);
  const fast = await api.stream();
  let slow!: IncomingMessage;
  let lost = false;
  let resolveLost!: () => void;
  const loss = new Promise<void>(resolve => { resolveLost = resolve; });
  const req = request(api.base + '/events', { headers: api.headers });
  t.after(async () => { req.destroy(); slow?.destroy(); await fast.close(); });
  await new Promise<void>((resolve, reject) => {
    req.on('error', reject);
    req.on('response', response => {
      slow = response;
      response.on('error', () => {});
      response.on('close', () => { lost = true; resolveLost(); });
      response.once('data', () => { response.pause(); resolve(); });
    });
    req.end();
  });
  assert.equal(slow.statusCode, 200);
  await api.running();
  // A finite producer budget, not a sleep or assumed socket buffer size. The fast
  // receipt of each marker causally paces writes while slow's reader stays paused.
  for (let i = 0; i < 512; i++) {
    const text = `${i}:` + 'x'.repeat(32_768);
    port.emit('s', { type: 'text', text });
    await fast.next(f => f.event === 'core' && f.data.type === 'text' && f.data.text.startsWith(`${i}:`));
  }
  slow.resume();
  await new Promise<void>((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error('slow stream not closed after bounded overflow workload')), 5000);
    void loss.then(() => { clearTimeout(deadline); resolve(); });
  });
  assert.equal(lost, true);
  assert.equal((await api.request('/sessions/s')).status, 'running');
  assert.equal((await api.request('/sessions/s/command', { type: 'prompt', message: 'still usable' })).success, true);
  port.emit('s', { type: 'text', text: 'after-overflow' });
  await fast.next(f => f.event === 'core' && f.data.type === 'text' && f.data.text === 'after-overflow');
  assert.equal(port.commands.length, 1);
});
