import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { PortOutcome } from './types.ts';

export interface ClaudeLaunch {
  executable?: string;
  prefixArgs?: readonly string[];
  cwd?: string;
  stopDeadlineMs?: number;
}

export function trackClaudeExit(child: ChildProcessWithoutNullStreams) {
  let exited = false;
  const waiters = new Set<() => void>();
  const observed = () => {
    exited = true;
    for (const notify of [...waiters]) notify();
  };
  child.once('exit', observed);
  child.once('close', observed);
  return {
    get exited() { return exited; },
    stop(deadlineMs: number): Promise<PortOutcome> {
      if (exited) return Promise.resolve({ kind: 'confirmed' });
      return new Promise(resolve => {
        const finish = () => {
          clearTimeout(timer);
          waiters.delete(finish);
          resolve({ kind: exited ? 'confirmed' : 'unknown' });
        };
        const timer = setTimeout(finish, deadlineMs);
        waiters.add(finish);
        // A failed stdin close must not skip termination of our own child.
        try { child.stdin.end(); } catch { /* Exit observation remains authoritative. */ }
        try { child.kill('SIGTERM'); } catch { finish(); }
        if (exited) finish();
      });
    },
  };
}

// Only transport selection belongs here; native resources and policy stay native.
export function launchClaude(config: ClaudeLaunch): ChildProcessWithoutNullStreams {
  return spawn(config.executable ?? 'claude', [
    ...(config.prefixArgs ?? []), '-p', '--input-format', 'stream-json',
    '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--permission-prompts', 'host',
  ], { cwd: config.cwd, shell: false, stdio: 'pipe' });
}
