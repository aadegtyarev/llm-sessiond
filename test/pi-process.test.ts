import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { test } from 'node:test';
import { trackPiExit } from '../src/pi-process.ts';

for (const observation of ['exit', 'close', 'none'] as const) {
  test(`pi process: kill return/EOF are not proof, observed ${observation} is`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let ends = 0, kills = 0;
    const child = Object.assign(new EventEmitter(), {
      stdin: { end() { ends++; } }, kill() { kills++; return true; },
    });
    const exit = trackPiExit(child as unknown as ChildProcessWithoutNullStreams);
    let done = false;
    const stop = exit.stop(1000); void stop.then(() => { done = true; });
    child.emit('end'); await Promise.resolve(); assert.equal(done, false);
    if (observation === 'none') t.mock.timers.tick(1000); else child.emit(observation);
    assert.deepEqual(await stop, { kind: observation === 'none' ? 'unknown' : 'confirmed' });
    assert.equal(ends, 1); assert.equal(kills, 1);
    child.emit('exit');
    assert.deepEqual(await exit.stop(1000), { kind: 'confirmed' });
    assert.equal(kills, 1);
  });
}
