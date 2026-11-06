import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { PortOutcome } from './types.ts';

export interface PiLaunch {
  executable?: string;
  prefixArgs?: readonly string[];
  cwd?: string;
  commandDeadlineMs?: number;
  stopDeadlineMs?: number;
}

export function trackPiExit(child: ChildProcessWithoutNullStreams) {
  let exited = false;
  const waiters = new Set<() => void>();
  const observed = () => {
    exited = true;
    for (const notify of [...waiters]) notify();
  };
  child.once('exit', observed);
  child.once('close', observed);
  async function stop(deadlineMs: number): Promise<PortOutcome> {
    if (exited) return { kind: 'confirmed' };
    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        waiters.delete(finish);
        resolve({ kind: exited ? 'confirmed' : 'unknown' });
      };
      const timer = setTimeout(finish, deadlineMs);
      waiters.add(finish);
      try {
        child.stdin.end();
        child.kill('SIGTERM');
      } catch { finish(); }
      if (exited) finish();
    });
  }
  return { stop, get exited() { return exited; } };
}

export function launchPi(config: PiLaunch, sessionFile?: string): ChildProcessWithoutNullStreams {
  const env = { ...process.env };
  delete env.PI_PACKAGE_DIR;
  return spawn(config.executable ?? 'pi', [
    ...(config.prefixArgs ?? []), '--mode', 'rpc', ...(sessionFile ? ['--session', sessionFile] : ['--no-session']),
  ], { cwd: config.cwd, env, shell: false, stdio: 'pipe' });
}
