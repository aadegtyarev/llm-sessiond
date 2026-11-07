import assert from 'node:assert/strict';
import type { HarnessPort } from '../src/types.ts';

// Failures belong to the test, independently of Core's exception -> unknown isolation.
export function fixtureHealth() {
  const failures: string[] = [];
  async function run<T>(phase: string, operation: () => Promise<T>): Promise<T> {
    try { return await operation(); }
    catch (error) {
      const detail = error instanceof assert.AssertionError ? error.message : 'fixture operation threw';
      failures.push(`${phase}: ${detail}`);
      throw error;
    }
  }
  const wrap = (port: HarnessPort): HarnessPort => ({
    start: (...args) => run('start', () => port.start(...args)),
    command: (...args) => run('command', () => port.command(...args)),
    stop: (...args) => run('stop', () => port.stop(...args)),
    ...(port.reply ? { reply: (...args: Parameters<NonNullable<HarnessPort['reply']>>) =>
      run('reply', () => port.reply!(...args)) } : {}),
  });
  return { run, wrap, assertHealthy: () => {
    assert.equal(failures.length, 0, `fixture health failure: ${failures.join('; ')}`);
  } };
}
