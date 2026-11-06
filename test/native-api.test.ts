import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('native API: external HTTP/SSE marker, clean daemon restart, exact recall and stopped delete', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e',
    "import { nativeSessionSmoke } from './test/native-session-smoke.mjs'; await nativeSessionSmoke();"],
  { cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 25_000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /"nativeSessionSmoke":"passed"/);
});
