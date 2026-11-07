import assert from 'node:assert/strict';
import { test } from 'node:test';
import reloadExtension, { RELOAD_ENV, RELOAD_DESCRIPTION } from '../src/pi-reload-extension.ts';

for (const name of [undefined, '', 'not-private', 'llm-sessiond-reload-invalid']) {
  test(`pi-reload-extension: invalid private environment does not register (${name === undefined ? 'absent' : 'invalid'})`, () => {
    const previous = process.env[RELOAD_ENV];
    try {
      if (name === undefined) delete process.env[RELOAD_ENV]; else process.env[RELOAD_ENV] = name;
      let registrations = 0;
      reloadExtension({ registerCommand() { registrations++; } });
      assert.equal(registrations, 0);
    } finally { if (previous === undefined) delete process.env[RELOAD_ENV]; else process.env[RELOAD_ENV] = previous; }
  });
}

test('pi-reload-extension: registered handler awaits native reload exactly once and propagates failure', async () => {
  const previous = process.env[RELOAD_ENV];
  try {
    process.env[RELOAD_ENV] = 'llm-sessiond-reload-00000000-0000-0000-0000-000000000000';
    let handler!: (args: string, context: { reload(): Promise<void> }) => Promise<void>;
    reloadExtension({ registerCommand(name, command) {
      assert.equal(name, process.env[RELOAD_ENV]); assert.equal(command.description, RELOAD_DESCRIPTION);
      handler = command.handler;
    } });
    let calls = 0, release!: () => void, finished = false;
    const pending = handler('', { reload() { calls++; return new Promise<void>(resolve => { release = resolve; }); } });
    void pending.then(() => { finished = true; });
    assert.equal(calls, 1); assert.equal(finished, false);
    release(); await pending; assert.equal(finished, true);
    await assert.rejects(handler('', { async reload() { throw new Error('native failure'); } }), /native failure/);
  } finally { if (previous === undefined) delete process.env[RELOAD_ENV]; else process.env[RELOAD_ENV] = previous; }
});
