import { record } from './daemon-schema.ts';

// Data only: safe to validate in clients without importing any runtime module.
export interface LaunchOptions {
  executable?: string;
  prefixArgs?: readonly string[];
  cwd?: string;
  stopDeadlineMs?: number;
}
export interface DaemonConfig {
  token: string;
  port: number;
  launch: LaunchOptions;
  harnesses?: Readonly<Record<string, LaunchOptions>>;
}

export function daemonConfig(value: unknown): DaemonConfig {
  const config = record(value);
  if (Object.keys(config).some(key => !['token', 'port', 'launch', 'harnesses'].includes(key))) throw new Error('config');
  const token = config.token;
  const port = config.port ?? 3000;
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/.test(token)
    || !Number.isInteger(port) || Number(port) < 0 || Number(port) > 65535) throw new Error('config');
  const launch = launchOptions(config.launch ?? {});
  const result: DaemonConfig = { token, port: Number(port), launch };
  if (Object.hasOwn(config, 'harnesses')) {
    result.harnesses = Object.fromEntries(Object.entries(record(config.harnesses))
      .map(([id, options]) => [id, launchOptions(options)]));
  }
  return result;
}

function launchOptions(value: unknown): LaunchOptions {
  const launch = record(value);
  if (Object.keys(launch).some(key => !['executable', 'prefixArgs', 'cwd', 'stopDeadlineMs'].includes(key))) {
    throw new Error('config');
  }
  for (const key of ['executable', 'cwd']) {
    if (key in launch && (typeof launch[key] !== 'string' || launch[key] === '')) throw new Error('config');
  }
  if ('prefixArgs' in launch && (!Array.isArray(launch.prefixArgs)
    || launch.prefixArgs.some(arg => typeof arg !== 'string'))) throw new Error('config');
  if ('stopDeadlineMs' in launch && (typeof launch.stopDeadlineMs !== 'number'
    || !Number.isFinite(launch.stopDeadlineMs) || launch.stopDeadlineMs <= 0)) throw new Error('config');
  return launch as LaunchOptions;
}
