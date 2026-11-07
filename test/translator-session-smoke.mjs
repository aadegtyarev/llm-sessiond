// Portable second external-process gate: native semantics stay in Pi.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { smokeDaemon } from './smoke-daemon.mjs';

export async function translatorSessionSmoke() {
  const root = mkdtempSync(join(tmpdir(), 'translator-smoke-'));
  let actor;
  try {
    // Deliberately malformed old metadata/history/lock bytes must remain untouched.
    mkdirSync(join(root, 'state')); mkdirSync(join(root, 'native'));
    const saved = new Map([
      [join(root, 'state', 'record.json'), 'not registry JSON'],
      [join(root, 'native', 'old.jsonl'), 'opaque history bytes\n'],
      [join(root, 'state', '.llm-sessiond.lock'), 'old lock'],
      [join(root, 'native', '.llm-sessiond.lock'), 'old lock'],
    ]);
    for (const [file, bytes] of saved) writeFileSync(file, bytes);
    actor = await smokeDaemon(root);
    for (const sessionId of ['Foo', 'foo', 'CON', '.leading', 'x'.repeat(128)]) {
      await actor.request('/sessions', { sessionId });
      await actor.request(`/sessions/${sessionId}/start`, {});
      const command = { type: 'switch_session', sessionPath: join(root, 'native', 'old.jsonl'), opaque: { nested: [1] } };
      const response = await actor.request(`/sessions/${sessionId}/command`, command);
      assert.deepEqual(response.data.received, { ...command, id: response.id });
      assert.equal((await actor.request(`/sessions/${sessionId}/command`, { type: 'get_state' })).success, true);
      assert.equal((await actor.request(`/sessions/${sessionId}/stop`, {})).status, 'stopped');
    }
    await actor.request('/native-sessions', undefined, 404);
    await actor.request('/sessions/Foo/delete', {}, 404);
    assert.deepEqual(await actor.request('/shutdown', {}), { stoppedSessionIds: [], uncertainSessionIds: [], failedSessionIds: [] });
    await actor.exited(); await actor.cleanup();
    actor = await smokeDaemon(root);
    assert.deepEqual(await actor.request('/sessions'), []); // Connections are local, not a history registry.
    await actor.request('/shutdown', {}); await actor.exited();
    for (const [file, bytes] of saved) assert.equal(readFileSync(file, 'utf8'), bytes);
    assert.deepEqual(readdirSync(join(root, 'native')).sort(), ['.llm-sessiond.lock', 'old.jsonl']);
    assert.deepEqual(readdirSync(join(root, 'state')).sort(), ['.llm-sessiond.lock', 'record.json']);
    console.log(JSON.stringify({ translatorSessionSmoke: 'passed', platform: process.platform,
      scope: 'portable IDs, native history commands forwarded without file policy, local restart empty, old data untouched' }));
  } finally {
    await actor?.cleanup();
    rmSync(root, { recursive: true, force: true });
  }
}
