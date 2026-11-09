import { createHarnessRegistry, type HarnessPort } from './core.ts';
import { createPiHarness } from './pi-harness.ts';
import { createClaudeHarness } from './claude-harness.ts';
import type { DaemonConfig } from './daemon-config.ts';

/** Trusted, lazy composition. HTTP selectors never become imports or launch options. */
export function daemonHarnesses({ launch, harnesses }: Pick<DaemonConfig, 'launch' | 'harnesses'>) {
  const configured = new Map(Object.entries(harnesses ?? {}));
  if ([...configured.keys()].some(id => id !== 'pi' && id !== 'claude-code')) throw new Error('unknown harness');
  return createHarnessRegistry(new Map<string, HarnessPort>([
    ['pi', createPiHarness(configured.get('pi') ?? launch)],
    ['claude-code', createClaudeHarness(configured.get('claude-code') ?? {})],
  ]), 'pi');
}
