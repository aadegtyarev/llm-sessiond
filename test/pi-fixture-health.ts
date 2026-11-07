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
    send: (...args) => run('send', () => port.send(...args)),
    stop: (...args) => run('stop', () => port.stop(...args)),
    ...(port.cancel ? { cancel: (...args: Parameters<NonNullable<HarnessPort['cancel']>>) =>
      run('cancel', () => port.cancel!(...args)) } : {}),
    ...(port.models ? { models: (...args: Parameters<NonNullable<HarnessPort['models']>>) =>
      run('models', () => port.models!(...args)) } : {}),
    ...(port.settings ? { settings: (...args: Parameters<NonNullable<HarnessPort['settings']>>) =>
      run('settings', () => port.settings!(...args)) } : {}),
    ...(port.setModel ? { setModel: (...args: Parameters<NonNullable<HarnessPort['setModel']>>) =>
      run('setModel', () => port.setModel!(...args)) } : {}),
    ...(port.setThinkingLevel ? { setThinkingLevel: (...args: Parameters<NonNullable<HarnessPort['setThinkingLevel']>>) =>
      run('setThinkingLevel', () => port.setThinkingLevel!(...args)) } : {}),
    ...(port.reload ? { reload: (...args: Parameters<NonNullable<HarnessPort['reload']>>) =>
      run('reload', () => port.reload!(...args)) } : {}),
    ...(port.compact ? { compact: (...args: Parameters<NonNullable<HarnessPort['compact']>>) =>
      run('compact', () => port.compact!(...args)) } : {}),
    ...(port.reply ? { reply: (...args: Parameters<NonNullable<HarnessPort['reply']>>) =>
      run('reply', () => port.reply!(...args)) } : {}),
  });
  return { run, wrap, assertHealthy: () => {
    assert.equal(failures.length, 0, `fixture health failure: ${failures.join('; ')}`);
  } };
}
