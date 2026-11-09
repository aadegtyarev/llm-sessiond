import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { daemonConfig } from '../src/daemon-config.ts';
import { daemonHarnesses } from '../src/daemon-harnesses.ts';
import { SessionCore } from '../src/core.ts';

const token = 'integration_' + 'a'.repeat(32);
const claudeFixture = fileURLToPath(new URL('./claude-fixture.mjs', import.meta.url));
const piFixture = fileURLToPath(new URL('./translator-child.ts', import.meta.url));

test('daemon-config: absent harnesses preserves exact legacy result; opaque keys are data only', () => {
  assert.deepEqual(daemonConfig({ token }), { token, port: 3000, launch: {} });
  const launch = { executable: process.execPath, prefixArgs: ['legacy'], cwd: '.', stopDeadlineMs: 123 };
  assert.deepEqual(daemonConfig({ token, launch }), { token, port: 3000, launch });
  const harnesses = JSON.parse('{"__proto__":{},"constructor":{},"opaque / module":{}}');
  assert.deepEqual(daemonConfig({ token, harnesses }), { token, port: 3000, launch: {}, harnesses });
  assert.equal(Object.hasOwn(daemonConfig({ token }), 'harnesses'), false);
});

for (const [name, launch] of [['null', null], ['undefined', undefined]] as const) {
  test(`daemon-config: legacy launch ${name} preserves exact nullish default`, () => {
    assert.deepEqual(daemonConfig({ token, launch }), { token, port: 3000, launch: {} });
    const harnesses = { pi: {}, 'claude-code': { executable: process.execPath } };
    assert.deepEqual(daemonConfig({ token, launch, harnesses }), { token, port: 3000, launch: {}, harnesses });
  });
}

for (const value of [null, [], '', 1, true]) {
  test(`daemon-config: rejects invalid harness map ${JSON.stringify(value)}`, () => {
    assert.throws(() => daemonConfig({ token, harnesses: value }));
  });
}
for (const [index, options] of [null, [], '', 1, true, { executable: '' }, { executable: 1 }, { cwd: '' }, { cwd: false },
  { prefixArgs: 'x' }, { prefixArgs: [1] }, { stopDeadlineMs: 0 }, { stopDeadlineMs: -1 },
  { stopDeadlineMs: Infinity }, { stopDeadlineMs: NaN }, { stopDeadlineMs: '1' }, { token }, { model: 'no' }, false, 0].entries()) {
  test(`daemon-config: strict module launch validation and non-null legacy rejection, invalid case ${index}`, () => {
    // Nullish defaults belong only to legacy root launch, not module entries.
    if (options !== null) assert.throws(() => daemonConfig({ token, launch: options }));
    for (const id of ['pi', 'claude-code', 'future']) {
      assert.throws(() => daemonConfig({ token, harnesses: { [id]: options } }));
    }
  });
}

test('daemon-config: no new defaults or backend policy root fields', () => {
  for (const key of ['defaultHarness', 'backend', 'executable', 'model']) {
    assert.throws(() => daemonConfig({ token, [key]: 'pi' }));
  }
});

test('daemon-harnesses: unknown own module IDs reject before any lazy factory/start effects', () => {
  for (const id of ['future', '', '__proto__', 'constructor', 'toString', '../pi']) {
    // Invalid deadline would throw RangeError if factories ran before ID admission.
    assert.throws(() => daemonHarnesses({ launch: { stopDeadlineMs: 0 }, harnesses: { [id]: {} } }),
      error => error instanceof Error && error.message === 'unknown harness');
  }
});

test('daemon-cli: unknown configured module fails before bind/spawn and exposes no config', async t => {
  const root = mkdtempSync(join(tmpdir(), 'unknown module '));
  const marker = join(root, 'spawn-marker');
  const child = spawn(process.execPath, [fileURLToPath(new URL('../src/daemon-cli.ts', import.meta.url))], { stdio: 'pipe', shell: false });
  const deadline = setTimeout(() => child.kill(), 10_000);
  const closed = once(child, 'close');
  t.after(async () => { clearTimeout(deadline); if (child.exitCode === null && child.signalCode === null) child.kill(); await closed;
    rmSync(root, { recursive: true, force: true }); });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
  child.stdin.on('error', () => {});
  child.stdin.end(JSON.stringify({ token, port: 0,
    launch: { executable: process.execPath, prefixArgs: [claudeFixture, 'marker', marker] }, harnesses: { unknown: {} } }));
  assert.deepEqual(await closed, [1, null]);
  assert.equal(stdout, ''); assert.equal(stderr, 'daemon startup failed\n'); assert.equal(existsSync(marker), false);
});

test('daemon-harnesses: registration/create are lazy even with missing Claude installation', async t => {
  const root = mkdtempSync(join(tmpdir(), 'module lazy '));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const marker = join(root, 'spawn-marker');
  const registry = daemonHarnesses({ launch: { executable: process.execPath, prefixArgs: [piFixture] },
    harnesses: { 'claude-code': { executable: process.execPath, prefixArgs: [claudeFixture, 'marker', marker] } } });
  const core = new SessionCore(registry);
  t.after(() => core.shutdown());
  assert.deepEqual(core.create('selected', 'claude-code'), { sessionId: 'selected', status: 'created', harness: 'claude-code' });
  core.create('default');
  assert.equal(existsSync(marker), false);
  await core.start('default');
  assert.equal(existsSync(marker), false);
  await core.stop('default');
  const missing = new SessionCore(daemonHarnesses({ launch: { executable: process.execPath, prefixArgs: [piFixture] },
    harnesses: { 'claude-code': { executable: join(root, 'not-installed') } } }));
  t.after(() => missing.shutdown());
  missing.create('pi'); await missing.start('pi'); await missing.stop('pi');
});

test('daemon-harnesses: whole Pi override and independent Claude launch do not inherit legacy fields', async t => {
  const root = mkdtempSync(join(tmpdir(), 'module launch '));
  const config = daemonConfig({ token, launch: { executable: 'must-not-execute', prefixArgs: ['legacy-leak'], cwd: 'missing' },
    harnesses: { pi: { executable: process.execPath, prefixArgs: [piFixture, '--pi-only'], cwd: root },
      'claude-code': { executable: process.execPath, prefixArgs: [claudeFixture, 'normal'] } } });
  const core = new SessionCore(daemonHarnesses({ launch: config.launch, harnesses: config.harnesses }));
  t.after(async () => { await core.shutdown(); rmSync(root, { recursive: true, force: true }); });
  core.create('pi'); core.create('claude', 'claude-code');
  await core.start('pi'); await core.start('claude');
  const pi = await core.command('pi', { type: 'get_state' });
  assert.ok('data' in pi);
  assert.deepEqual(pi.data, { isStreaming: true, pendingMessageCount: 7, pid: (pi.data as { pid: number }).pid,
    argv: ['--pi-only', '--mode', 'rpc'], cwd: root, packageDir: null });
  const claude = await core.command('claude', { type: 'control_request', request: { subtype: 'inspect' } });
  assert.ok('response' in claude);
  const observed = (claude.response as { response: { cwd: string; argv: string[] } }).response;
  assert.equal(observed.cwd, process.cwd());
  assert.equal(observed.argv[0], 'normal');
  assert.equal(observed.argv.includes('--pi-only'), false);
  assert.equal(JSON.stringify([pi, claude]).includes('legacy-leak'), false);
  assert.equal(JSON.stringify([pi, claude]).includes(token), false);
  const defaults = daemonHarnesses({ launch: {} });
  assert.equal(defaults.resolve('constructor'), undefined);
  assert.ok(defaults.resolve('claude-code'));
});
