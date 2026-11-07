import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('translator API: external portable connections, Native commands and untouched old data', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e',
    "import { translatorSessionSmoke } from './test/translator-session-smoke.mjs'; await translatorSessionSmoke();"],
  { cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 25_000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /"translatorSessionSmoke":"passed"/);
});
