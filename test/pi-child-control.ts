import { appendFileSync, existsSync, watch } from 'node:fs';
import { join } from 'node:path';

const directory = process.argv.find(arg => arg.startsWith('--trace-dir='))?.split('=')[1];
export function phase(name: string) {
  if (directory) appendFileSync(join(directory, String(process.pid)), name + '\n');
}

// Sideband gates model loss *after* the parent consumed ACK/boundary evidence.
export function afterConsumption(gate: string | undefined, action: () => void) {
  if (!directory || !gate) { action(); return; }
  const path = join(directory, gate);
  const check = () => {
    if (!existsSync(path)) return;
    watcher.close();
    action();
  };
  const watcher = watch(directory, check);
  check();
}
