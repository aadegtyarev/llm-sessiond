import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { createPiControls } from '../src/pi-controls.ts';
import { wireDouble } from './pi-wire-double.ts';
import { reloadExtensionPath } from '../src/pi-process.ts';
import { RELOAD_DESCRIPTION } from '../src/pi-reload-extension.ts';
import type { RecordValue } from '../src/pi-wire.ts';

const privateName = 'llm-sessiond-reload-00000000-0000-0000-0000-000000000000';
const state = { sessionId: 'owned', model: { provider: 'fixture', id: 'one' }, thinkingLevel: 'off',
  messageCount: 2, isStreaming: false, isCompacting: false, pendingMessageCount: 0 };
function fixture() {
  let controls!: ReturnType<typeof createPiControls>, uncertainty = 0;
  const peer = wireDouble(100, record => controls.event(record));
  controls = createPiControls({ wire: peer.wire, ready: true, idle: true, questionsAdmissible: true,
    questionsQuiescent: true, questionBarrier: () => () => {}, identity: () => ({ sessionId: 'owned' }),
    uncertain() { uncertainty++; }, lostOwnership() { uncertainty++; peer.wire.fail(); } }, privateName);
  let consumed = 0;
  async function frame(type: string, data?: RecordValue) {
    for (let attempts = 0; peer.frames.length <= consumed && attempts < 100; attempts++) await setImmediate();
    assert.equal(peer.frames.length, consumed + 1, `causal ${type} frame`);
    assert.equal(peer.frames[consumed].type, type);
    consumed++;
    if (data) { peer.release(); peer.respond({ data }); }
  }
  async function preflight() {
    await frame('get_state', state);
    await frame('get_available_thinking_levels', { levels: ['off'] });
    await frame('get_commands', { commands: [{ name: privateName, description: RELOAD_DESCRIPTION, source: 'extension',
      sourceInfo: { path: reloadExtensionPath, source: 'cli', scope: 'temporary', origin: 'top-level' } }] });
    await frame('prompt');
  }
  return { peer, controls, frame, preflight, get uncertainty() { return uncertainty; } };
}

for (const fault of ['write', 'wrong-command', 'eof', 'timeout', 'handled-error', 'resource-error']) {
  test(`pi-controls-wire: causal private dispatch then ${fault} cannot claim reload or accept late ACK`, async t => {
    const f = fixture(); t.after(f.peer.cleanup);
    const pending = f.controls.reload();
    await f.preflight();
    assert.equal(f.peer.frames.length, 4); // Fault is AFTER valid state/capability/helper preflight.
    if (fault === 'write') f.peer.release(new Error('private write'));
    else if (fault === 'wrong-command') { f.peer.release(); f.peer.respond({ command: 'get_state' }); }
    else if (fault === 'eof') f.peer.stdout.end();
    else if (fault === 'handled-error' || fault === 'resource-error') {
      f.peer.stdout.write(JSON.stringify({ type: 'extension_error', extensionPath: fault === 'handled-error'
        ? `command:${privateName}` : '/private/resource', event: 'command', error: 'private' }) + '\n');
      f.peer.release(); f.peer.respond({ data: { disposition: 'handled' } });
    }
    const result = await pending;
    assert.deepEqual(result, { kind: 'unknown', effectUncertain: true });
    assert.equal(f.uncertainty, 1);
    if (fault !== 'eof') f.peer.respond({ data: { disposition: 'handled' } });
    assert.deepEqual(result, { kind: 'unknown', effectUncertain: true });
    assert.equal(f.uncertainty, 1);
  });
}

test('pi-controls-wire: success waits for prompt local drain AND authoritative readback', async t => {
  const f = fixture(); t.after(f.peer.cleanup);
  let settled = false;
  const pending = f.controls.reload().then(value => { settled = true; return value; });
  await f.preflight();
  f.peer.respond({ data: { disposition: 'handled' } });
  await setImmediate();
  assert.equal(settled, false); assert.equal(f.peer.frames.length, 4);
  f.peer.release();
  await f.frame('get_state', state);
  await f.frame('get_available_thinking_levels', { levels: ['off'] });
  await f.frame('get_commands', { commands: [{ name: privateName, description: RELOAD_DESCRIPTION, source: 'extension',
    sourceInfo: { path: reloadExtensionPath, source: 'cli', scope: 'temporary', origin: 'top-level' } }] });
  assert.equal((await pending).kind, 'confirmed');
  assert.equal(f.uncertainty, 0);
});
