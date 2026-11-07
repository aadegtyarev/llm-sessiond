// Portable external-process persistence gate. No project TypeScript imports.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { apiClient } from './api-client.mjs';

export async function nativeSessionSmoke() {
  const root = mkdtempSync(join(tmpdir(), 'sessiond-native-smoke-'));
  const actors = [];
  const streams = [];
  const token = randomBytes(32).toString('base64url');
  const stateDir = join(root, 'state'), nativeSessionDir = join(root, 'native');
  const portableIds = ['Foo', 'foo', 'CON', '.leading', 'x'.repeat(128)];
  async function daemon() {
    const child = spawn(process.execPath, [fileURLToPath(new URL('../src/daemon-cli.ts', import.meta.url))], { stdio: 'pipe' });
    const exit = once(child, 'exit');
    const actor = { child, exit, stderr: '' };
    actors.push(actor);
    child.stderr.on('data', bytes => { actor.stderr += bytes; });
    const lines = createInterface({ input: child.stdout });
    const ready = once(lines, 'line');
    const timer = setTimeout(() => child.kill(), 15_000);
    child.stdin.end(JSON.stringify({ token, port: 0, stateDir, nativeSessionDir,
      launch: { executable: process.execPath, cwd: root,
        prefixArgs: [fileURLToPath(new URL('./native-history-child.ts', import.meta.url)), root] } }));
    try {
      const [line] = await Promise.race([ready, exit.then(() => { throw new Error('daemon exited before bind'); })]);
      const api = apiClient(JSON.parse(line).listening.port, token);
      const stream = await api.stream(); streams.push(stream);
      return { api, stream, async close() {
        assert.deepEqual(await api.request('/shutdown', {}), { stoppedSessionIds: [], uncertainSessionIds: [], failedSessionIds: [] });
        assert.deepEqual(await exit, [0, null]);
        assert.equal(actor.stderr, '');
      } };
    } finally { clearTimeout(timer); }
  }
  const completed = (stream, id) => stream.next(frame => frame.event === 'core'
    && frame.data.type === 'input' && frame.data.input.inputId === id && frame.data.input.status === 'completed');
  try {
    const first = await daemon();
    assert.deepEqual(await first.api.request('/sessions'), []);
    assert.deepEqual(await first.api.request('/native-sessions'), []);
    await first.api.request('/sessions', { sessionId: 'saved' });
    const files = readdirSync(nativeSessionDir).filter(name => name.endsWith('.jsonl'));
    assert.equal(files.length, 1);
    const file = join(nativeSessionDir, files[0]);
    assert.equal(readFileSync(file, 'utf8'), ''); // Daemon reserves, never writes a header.
    writeFileSync(join(root, 'plugin-version'), 'v1');
    await first.api.request('/sessions/saved/start', {});
    const initialResource = await first.stream.next(frame => frame.event === 'core' && frame.data.type === 'notification'
      && frame.data.statusKey === 'fixture-resource');
    const sameResourceIdentity = initialResource.data.statusText.slice(2);
    assert.equal(initialResource.data.statusText, `v1${sameResourceIdentity}`);
    await first.stream.next(frame => frame.event === 'core' && frame.data.type === 'tool' && frame.data.toolCallId === 'startup-resource');
    const nativeId = JSON.parse(readFileSync(file, 'utf8').split('\n')[0]).id;
    const marker = 'external-context-marker-compact';
    await first.api.request('/sessions/saved/send', { inputId: 'remember', text: marker });
    await completed(first.stream, 'remember');
    const models = await first.api.request('/sessions/saved/models');
    assert.deepEqual(models, { kind: 'confirmed', value: [
      { provider: 'fixture', id: 'one', name: 'One' }, { provider: 'fixture', id: 'two', name: 'Two' },
    ] });
    const initialSettings = await first.api.request('/sessions/saved/settings');
    assert.equal(initialSettings.value.model.id, 'one');
    assert.deepEqual(initialSettings.value.availableThinkingLevels, ['off', 'low', 'high']);
    assert.equal((await first.api.request('/sessions/saved/thinking-level', { level: 'high' })).value.thinkingLevel, 'high');
    const selected = await first.api.request('/sessions/saved/model', { provider: 'fixture', modelId: 'two' });
    assert.equal(selected.value.model.id, 'two'); assert.equal(selected.value.thinkingLevel, 'off');
    assert.deepEqual(selected.value.availableThinkingLevels, ['off']);
    assert.deepEqual(await first.api.request('/sessions/saved/thinking-level', { level: 'high' }), { kind: 'rejected' });
    writeFileSync(join(root, 'plugin-version'), 'v2');
    assert.deepEqual(await first.api.request('/sessions/saved/reload', {}), selected);
    await first.stream.next(frame => frame.event === 'core' && frame.data.type === 'notification'
      && frame.data.statusText === `v2${sameResourceIdentity}`);
    await first.stream.next(frame => frame.event === 'core' && frame.data.type === 'notification'
      && frame.data.method === 'notify' && frame.data.message === 'fixture-reloaded');
    assert.deepEqual(await first.api.request('/sessions/saved/settings'), selected);
    assert.equal(JSON.stringify([models, selected]).includes('private'), false);
    await first.api.request('/sessions/saved/send', { inputId: 'post-reload-recall', text: 'recall' });
    await completed(first.stream, 'post-reload-recall');
    await first.stream.next(frame => frame.event === 'core' && frame.data.type === 'text' && frame.data.text === marker);
    await first.api.request('/sessions/saved/send', { inputId: 'post-reload-wait', text: 'fixture:wait-controls' });
    assert.equal((await first.api.request('/sessions/saved/cancel', { inputId: 'post-reload-wait' })).status, 'cancelled');
    await first.api.request('/sessions/saved/send', { inputId: 'post-reload-question', text: 'fixture:questions-controls' });
    await first.stream.next(frame => frame.event === 'core' && frame.data.type === 'question' && frame.data.question.requestId === 'controls-question');
    assert.deepEqual(await first.api.request('/sessions/saved/reply', { requestId: 'controls-question', method: 'confirm', confirmed: true }), { kind: 'written' });
    await completed(first.stream, 'post-reload-question');
    await first.stream.next(frame => frame.event === 'core' && frame.data.type === 'text'
      && frame.data.text === `reply-consumed:${sameResourceIdentity.split(':')[1]}`);
    assert.deepEqual(await first.api.request('/sessions/saved/reload', {}), selected); // Ordered idle readback settles written UI ID.
    assert.deepEqual(await first.api.request('/sessions/saved/reply', { requestId: 'controls-question', method: 'confirm', confirmed: true }), { kind: 'rejected' });
    await first.api.request('/sessions/saved/delete', {}, 409);
    await first.api.request('/sessions/saved/stop', {});
    await first.api.request('/sessions', { sessionId: 'empty' });
    await first.api.request('/sessions/empty/stop', {});
    for (const sessionId of portableIds) {
      await first.api.request('/sessions', { sessionId });
      await first.api.request(`/sessions/${sessionId}/stop`, {});
    }
    const metadataNames = readdirSync(stateDir).filter(name => name.endsWith('.json'));
    assert.equal(new Set(metadataNames.map(name => name.toLowerCase())).size, metadataNames.length);
    assert.equal(metadataNames.every(name => name.length <= 255), true);
    const unrelated = join(nativeSessionDir, 'unrelated.txt');
    writeFileSync(unrelated, 'preserve tool effects');
    await first.close();
    const healthBefore = readdirSync(root).filter(name => name.endsWith('.health')).length;
    const second = await daemon();
    assert.equal(readdirSync(root).filter(name => name.endsWith('.health')).length, healthBefore);
    const restored = await second.api.request('/sessions/saved');
    assert.equal(restored.status, 'stopped');
    assert.equal(restored.input.status, 'completed');
    assert.equal((await second.api.request('/sessions/empty')).input, null);
    for (const sessionId of portableIds) assert.deepEqual(await second.api.request(`/sessions/${sessionId}`),
      { sessionId, status: 'stopped', input: null });
    assert.equal(JSON.stringify(await second.api.request('/sessions')).includes(root), false);
    assert.deepEqual(await second.api.request('/native-sessions'), [{ nativeId }]);
    await second.api.request('/sessions/duplicate/register', { nativeId }, 409);
    await second.api.request('/sessions/saved/start', {}); // Exact reopen, same registered file.
    assert.deepEqual(await second.api.request('/sessions/saved/settings'), selected);
    await second.api.request('/sessions/saved/send', { inputId: 'remember', text: 'must-not-run' }, 409);
    await second.api.request('/sessions/saved/send', { inputId: 'recall', text: 'recall' });
    await completed(second.stream, 'recall');
    await second.stream.next(frame => frame.event === 'core' && frame.data.type === 'text' && frame.data.text === marker);
    assert.equal(JSON.parse(readFileSync(file, 'utf8').split('\n')[0]).id, nativeId);
    await second.api.request('/sessions/saved/stop', {});
    const markerCount = () => second.stream.events.filter(frame => frame.event === 'core'
      && frame.data.type === 'text' && frame.data.sessionId === 'saved' && frame.data.text === marker).length;
    const beforeReopen = markerCount();
    await second.api.request('/sessions/saved/start', {});
    await second.api.request('/sessions/saved/send', { inputId: 'same-daemon-recall', text: 'recall' });
    await completed(second.stream, 'same-daemon-recall');
    assert.equal(markerCount(), beforeReopen + 1);
    await second.api.request('/sessions/saved/stop', {});
    const importCopy = join(root, 'trusted-import-copy.jsonl');
    copyFileSync(file, importCopy);
    await second.api.request('/sessions/saved/delete', {});
    assert.equal(readdirSync(nativeSessionDir).includes(files[0]), false);
    assert.equal(readFileSync(unrelated, 'utf8'), 'preserve tool effects');
    await second.api.request('/sessions/empty/delete', {});
    for (const sessionId of portableIds) await second.api.request(`/sessions/${sessionId}/delete`, {});
    assert.deepEqual(await second.api.request('/sessions'), []);
    copyFileSync(importCopy, file);
    await second.api.request('/native-sessions', undefined, 401, { headers: {} });
    await second.api.request('/sessions/imported/register', { nativeId: file }, 409);
    await second.api.request('/sessions/imported/register', { nativeId });
    await second.api.request('/sessions/imported/start', {});
    await second.api.request('/sessions/imported/send', { inputId: 'import-recall', text: 'recall' });
    await completed(second.stream, 'import-recall');
    await second.stream.next(frame => frame.event === 'core' && frame.data.type === 'text'
      && frame.data.sessionId === 'imported' && frame.data.text === marker);
    await second.api.request('/sessions/imported/stop', {});
    await second.api.request('/sessions/imported/delete', {});
    assert.equal(readFileSync(unrelated, 'utf8'), 'preserve tool effects');
    await second.close();
    const third = await daemon();
    assert.deepEqual(await third.api.request('/sessions'), []);
    await third.close();
    const health = readdirSync(root).filter(name => name.endsWith('.health'));
    assert.equal(health.length, 4);
    for (const name of health) assert.equal(readFileSync(join(root, name), 'utf8'), 'healthy');
    console.log(JSON.stringify({ nativeSessionSmoke: 'passed', platform: process.platform,
      context: 'external marker -> clean stop/shutdown -> new daemon -> exact recall, no marker replay',
      controls: 'catalogue -> effort -> model clamp -> genuine fake reload v1/v2 same PID/native context/settings -> native history reopen readback',
      registry: 'empty record + used IDs + no auto-launch + trusted exact UUID import + Windows-safe case-sensitive IDs', deletion: 'stopped only; unrelated file preserved' }));
  } finally {
    for (const stream of streams) await stream.close();
    for (const actor of actors) {
      if (actor.child.exitCode === null && actor.child.signalCode === null) actor.child.kill();
      await actor.exit;
    }
    rmSync(root, { recursive: true, force: true });
  }
}
