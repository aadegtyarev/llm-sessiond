import { record } from './daemon-schema.ts';
import type { PiLaunch } from './pi-process.ts';
import type { NativeOptions } from './native-registry.ts';

export function daemonConfig(value: unknown): { token: string; port: number; launch: PiLaunch; native?: NativeOptions } {
  const config = record(value);
  if (Object.keys(config).some(key => !['token', 'port', 'launch', 'stateDir', 'nativeSessionDir'].includes(key))) throw new Error('config');
  const token = config.token;
  const port = config.port ?? 3000;
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/.test(token)
    || !Number.isInteger(port) || Number(port) < 0 || Number(port) > 65535) throw new Error('config');
  const launch = record(config.launch ?? {});
  if (Object.keys(launch).some(key => !['executable', 'prefixArgs', 'cwd', 'commandDeadlineMs', 'stopDeadlineMs'].includes(key))) {
    throw new Error('config');
  }
  for (const key of ['executable', 'cwd']) {
    if (key in launch && (typeof launch[key] !== 'string' || launch[key] === '')) throw new Error('config');
  }
  if ('prefixArgs' in launch && (!Array.isArray(launch.prefixArgs)
    || launch.prefixArgs.some(arg => typeof arg !== 'string'))) throw new Error('config');
  for (const key of ['commandDeadlineMs', 'stopDeadlineMs']) {
    if (key in launch && (typeof launch[key] !== 'number' || !Number.isFinite(launch[key]) || launch[key] <= 0)) {
      throw new Error('config');
    }
  }
  const result = { token, port: Number(port), launch: launch as PiLaunch };
  if ('stateDir' in config || 'nativeSessionDir' in config) {
    if (typeof config.stateDir !== 'string' || !config.stateDir || typeof config.nativeSessionDir !== 'string'
      || !config.nativeSessionDir) throw new Error('config');
    return { ...result, native: { stateDir: config.stateDir, nativeSessionDir: config.nativeSessionDir,
      cwd: launch.cwd as string | undefined } };
  }
  return result;
}
