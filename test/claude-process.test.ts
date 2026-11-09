import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { test } from 'node:test';
import { trackClaudeExit } from '../src/claude-process.ts';

for (const observation of ['exit', 'close', 'none', 'throw', 'end-throw'] as const) {
  test(`claude process: owned cleanup needs observed fact (${observation})`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let ends = 0, kills = 0;
    const child = Object.assign(new EventEmitter(), {
      stdin: { end() { ends++; if (observation === 'end-throw') throw new Error('private'); } }, kill() {
        kills++; if (observation === 'throw') throw new Error('private'); return true;
      },
    });
    const exit = trackClaudeExit(child as unknown as ChildProcessWithoutNullStreams);
    const stop = exit.stop(1000);
    child.emit('end');
    if (observation === 'none' || observation === 'end-throw') t.mock.timers.tick(1000);
    if (observation === 'exit' || observation === 'close') child.emit(observation);
    assert.deepEqual(await stop, { kind: observation === 'exit' || observation === 'close' ? 'confirmed' : 'unknown' });
    assert.equal(ends, 1); assert.equal(kills, 1);
    if (!exit.exited) {
      const explicitRetry = exit.stop(1000);
      child.emit('exit');
      // A synchronous kill exception is already unknown, not retroactively confirmed.
      assert.deepEqual(await explicitRetry, { kind: observation === 'throw' ? 'unknown' : 'confirmed' });
      assert.equal(kills, 2);
    }
    assert.deepEqual(await exit.stop(1000), { kind: 'confirmed' });
  });
}
