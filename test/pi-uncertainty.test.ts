import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boundary, final, fixture } from './pi-support.ts';

for (const flag of ['--no-ready', '--wrong-ready', '--malformed-ready']) {
  test(`pi readiness requires matching command path ${flag}`, async (t) => {
    const f = await fixture(t, [flag], flag === '--no-ready' ? 300 : undefined);
    assert.equal((await f.rawStart()).kind, 'unknown');
    await f.phase('get_state');
    assert.equal((await f.rawSend({ records: final() })).kind, 'unknown');
    assert.ok(!f.phases().includes('prompt'));
  });
}
for (const scenario of [
  { noAck: true }, { delayAck: 450, records: final() }, { exitBeforeAck: true },
  { wrongCommand: true },
]) {
  test(`pi uncertain prompt ${JSON.stringify(scenario)}`, async (t) => {
    const f = await fixture(t, [], 300); // Intentional prompt ACK deadline.
    await f.start();
    const result = await f.send(scenario);
    assert.equal(result.kind, 'unknown');
    assert.ok(f.events.every((e) => e.type !== 'input-completed'));
  });
}

for (const scenario of [
  { exit: true }, { eof: true }, { raw: 'not json\n' },
  { raw: '{truncated', eof: true }, { invalidUtf8: true },
]) {
  test(`pi active channel loss is safe unknown ${JSON.stringify(scenario)}`, async (t) => {
    const f = await fixture(t);
    await f.start();
    await f.send({ ...scenario, records: [boundary] });
    await f.until(() => f.events.length > 0, 'active loss terminal');
    assert.deepEqual(f.events, [{ type: 'input-failed', inputId: 'i', certainty: 'unknown' }]);
    assert.equal((await f.send({ records: final() }, 'next')).kind, 'unknown');
  });
}

test('pi stop is confirmed only after observed process exit; unknown retains ownership', async (t) => {
  const f = await fixture(t, ['--hold-stop']);
  await f.start();
  assert.equal((await f.port.stop('s')).kind, 'unknown');
  assert.equal((await f.port.stop('s')).kind, 'confirmed');
  assert.equal((await f.port.stop('s')).kind, 'confirmed');
  assert.equal((await f.send({ records: final() })).kind, 'unknown');
  assert.deepEqual(f.events, []);
});

test('pi stdout EOF is not proof of stopped owned process', async (t) => {
  const f = await fixture(t, ['--hold-stop']);
  await f.start();
  await f.send({ eof: true, records: [boundary] });
  await f.until(() => f.events.length > 0, 'EOF terminal');
  assert.equal((await f.port.stop('s')).kind, 'unknown');
  assert.equal((await f.port.stop('s')).kind, 'confirmed');
});

test('pi stop during readiness does not resurrect a stopped child', async (t) => {
  const f = await fixture(t, ['--no-ready']);
  const start = f.rawStart();
  assert.equal((await f.port.stop('s')).kind, 'confirmed');
  assert.equal((await start).kind, 'unknown');
  assert.equal((await f.rawSend({ records: final() })).kind, 'unknown');
});

test('pi command rejection is not model completion and exposes no error text', async (t) => {
  const f = await fixture(t);
  await f.start();
  assert.equal((await f.send({ success: false })).kind, 'rejected');
  assert.deepEqual(f.events, []);
  assert.equal((await f.send({ records: final() }, 'next')).kind, 'confirmed');
  await f.until(() => f.events.length === 1, 'accepted prompt after rejection');
});
