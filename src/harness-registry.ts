import type { CommandResult, HarnessPort, HarnessRegistry } from './types.ts';

/** Trusted composition supplies opaque IDs and the default, never Core or HTTP imports. */
export function createHarnessRegistry<Result extends CommandResult>(
  ports: ReadonlyMap<string, HarnessPort<Result>>, defaultHarness: string,
): HarnessRegistry<Result> {
  // Later map changes affect future creates, never already-bound local sessions.
  return Object.freeze({
    resolve: (harness?: string) => ports.get(harness ?? defaultHarness),
  });
}
