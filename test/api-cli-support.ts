import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function cliProcess(args: string[], input: string | Uint8Array = '') {
  const child = spawn(process.execPath, [fileURLToPath(new URL('../src/api-cli.ts', import.meta.url)), ...args], {
    stdio: 'pipe', shell: false,
  });
  const deadline = setTimeout(() => child.kill(), 10_000);
  let stdout = '', stderr = '';
  const changed = new Set<() => void>();
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', text => { stdout += text; for (const wake of [...changed]) wake(); });
  child.stderr.on('data', text => { stderr += text; });
  child.stdin.on('error', () => {});
  child.stdin.end(input);
  const done = new Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }>((resolve, reject) => {
    child.once('error', error => { clearTimeout(deadline); reject(error); });
    child.once('close', (code, signal) => { clearTimeout(deadline); resolve({ code, signal, stdout, stderr }); for (const wake of [...changed]) wake(); });
  });
  async function next(predicate: (value: any) => boolean): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('CLI output evidence deadline')), 5000);
      function finish(error?: Error, value?: unknown) { clearTimeout(timer); changed.delete(check); error ? reject(error) : resolve(value); }
      function check() {
        try {
          const values = stdout.slice(0, stdout.lastIndexOf('\n') + 1).split('\n').filter(Boolean).map(line => JSON.parse(line));
          const found = values.find(predicate);
          if (found !== undefined) finish(undefined, found);
          else if (child.exitCode !== null || child.signalCode !== null) finish(new Error('CLI closed before evidence'));
        } catch { finish(new Error('invalid CLI JSON output')); }
      }
      changed.add(check); check();
    });
  }
  return { child, done, next, get stdout() { return stdout; },
    async cleanup() { if (child.exitCode === null && child.signalCode === null) child.kill(); await done; } };
}
