// Shared external Node-only daemon launcher for both portable smoke paths.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { apiClient } from './api-client.mjs';

export async function smokeDaemon(cwd) {
  const token = randomBytes(32).toString('base64url');
  const child = spawn(process.execPath, [fileURLToPath(new URL('../src/daemon-cli.ts', import.meta.url))], { stdio: 'pipe' });
  let stdout = '', stderr = '';
  child.stdout.on('data', bytes => { stdout += bytes; });
  child.stderr.on('data', bytes => { stderr += bytes; });
  const exit = once(child, 'exit');
  const deadline = setTimeout(() => child.kill(), 30_000);
  const lines = createInterface({ input: child.stdout });
  const ready = once(lines, 'line');
  child.stdin.end(JSON.stringify({ token, port: 0, launch: { executable: process.execPath, cwd,
    prefixArgs: [fileURLToPath(new URL('./translator-child.ts', import.meta.url))] } }));
  const cleanup = async () => {
    clearTimeout(deadline); lines.close();
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await exit;
  };
  try {
    const [line] = await Promise.race([ready, exit.then(() => { throw new Error('daemon exited before bind'); })]);
    const { listening } = JSON.parse(line);
    assert.equal(listening.host, '127.0.0.1');
    return { ...apiClient(listening.port, token), token, cleanup, async exited() {
      assert.deepEqual(await exit, [0, null]);
      assert.equal(stderr, ''); assert.equal(stdout.includes(token), false);
    } };
  } catch (error) { await cleanup(); throw error; }
}
