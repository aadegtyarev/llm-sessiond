import { readFile } from 'node:fs/promises';
import { daemonConfig } from './daemon-config.ts';
import { BODY_LIMIT, record, replyBody, sessionId } from './daemon-schema.ts';
import { callApi } from './api-client.ts';

type Operation = 'create' | 'list' | 'get' | 'start' | 'stop' | 'shutdown' | 'command' | 'compact' | 'reply' | 'events';
const operations: readonly string[] = ['create', 'list', 'get', 'start', 'stop', 'shutdown', 'command', 'compact', 'reply', 'events'];
const needsId = new Set(['create', 'get', 'start', 'stop', 'command', 'compact', 'reply']);
const decode = (bytes: Uint8Array) => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);

async function input(operation: Operation): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw new Error('input limit');
    chunks.push(chunk);
  }
  if (operation === 'compact' && size === 0) return '{}';
  const payload = decode(Buffer.concat(chunks));
  const body = record(JSON.parse(payload));
  if (operation === 'command' && (typeof body.type !== 'string' || !body.type)) throw new Error('type');
  if (operation === 'reply') replyBody(body);
  if (operation === 'compact' && (Object.keys(body).some(key => key !== 'customInstructions')
    || ('customInstructions' in body && typeof body.customInstructions !== 'string'))) throw new Error('compact');
  return payload;
}

async function main() {
  let target: { token: string; port: number; method: string; path: string; body?: string; events: boolean };
  try {
    // Prefix flags only; --harness ID is specific to create.
    const args = process.argv.slice(2), flags = new Map<string, string>();
    while (args[0]?.startsWith('--')) {
      const name = args.shift()!;
      const value = args.shift();
      if (!['--config', '--port', '--harness'].includes(name) || flags.has(name) || !value || value.startsWith('--')) throw new Error('arguments');
      flags.set(name, value);
    }
    const operation = args.shift() as Operation;
    if (!flags.has('--config') || !operations.includes(operation) || args.length !== (needsId.has(operation) ? 1 : 0)) throw new Error('arguments');
    if (flags.has('--harness') && operation !== 'create') throw new Error('arguments');
    const id = needsId.has(operation) ? sessionId(args[0]) : undefined;
    const bytes = await readFile(flags.get('--config')!);
    if (bytes.length > BODY_LIMIT) throw new Error('config limit');
    const config = daemonConfig(JSON.parse(decode(bytes)));
    let port = config.port;
    if (flags.has('--port')) {
      const value = flags.get('--port')!;
      if (!/^\d+$/.test(value)) throw new Error('port');
      port = Number(value);
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('port');
    const read = operation === 'list' || operation === 'get' || operation === 'events';
    let body: string | undefined = read ? undefined : '{}';
    if (operation === 'create') body = JSON.stringify({ sessionId: id,
      ...(flags.has('--harness') ? { harness: flags.get('--harness') } : {}) });
    if (operation === 'command' || operation === 'reply' || operation === 'compact') body = await input(operation);
    const path = operation === 'shutdown' ? '/shutdown' : operation === 'events' ? '/events'
      : operation === 'create' || operation === 'list' ? '/sessions'
      : `/sessions/${id}${operation === 'get' ? '' : `/${operation}`}`;
    target = { token: config.token, port, path, method: read ? 'GET' : 'POST', body, events: operation === 'events' };
  } catch { process.stderr.write('invalid CLI input\n'); process.exitCode = 2; return; }
  try { process.exitCode = await callApi(target.port, target.token, target.method, target.path, target.body, target.events, process.stdout); }
  catch { process.stderr.write('API transport failed\n'); process.exitCode = 1; }
}
process.stdout.on('error', () => { process.exitCode = 1; });
process.stderr.on('error', () => {});
void main();
