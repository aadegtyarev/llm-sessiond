import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { daemonConfig } from '../src/daemon-config.ts';

const token = randomBytes(32).toString('base64url');
test('daemon config allows only trusted launch settings and bounded token/port', () => {
  assert.deepEqual(daemonConfig({ token }), { token, port: 3000, launch: {} });
  for (const config of [null, [], {}, { token: 'short' }, { token, port: -1 }, { token, port: 1.5 },
    { token, port: 65536 }, { token, host: '0.0.0.0' }, { token, launch: { rawRpc: {} } },
    { token, launch: { executable: '' } }, { token, launch: { prefixArgs: [1] } },
    { token, launch: { cwd: 1 } }, { token, launch: { stopDeadlineMs: 0 } },
    { token, launch: { commandDeadlineMs: Infinity } }]) {
    assert.throws(() => daemonConfig(config));
  }
});

for (const mode of ['argv', 'bad-json', 'oversize', 'invalid-utf8']) {
  test(`daemon CLI rejects ${mode} without logging config or credential`, async () => {
    const child = spawn(process.execPath, [fileURLToPath(new URL('../src/daemon-cli.ts', import.meta.url)),
      ...(mode === 'argv' ? ['--unsupported'] : [])], { stdio: 'pipe' });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.stdin.on('error', () => {});
    const exit = once(child, 'exit');
    child.stdin.end(mode === 'oversize' ? token + 'x'.repeat(65536) : mode === 'invalid-utf8' ? Buffer.from([0xff]) : token);
    assert.deepEqual(await exit, [1, null]);
    assert.equal(stdout, ''); assert.equal(stderr, 'daemon startup failed\n');
  });
}
