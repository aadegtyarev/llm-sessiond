import { listenDaemon } from './daemon.ts';
import { daemonConfig } from './daemon-config.ts';
import { createPiHarness } from './pi-harness.ts';

async function main() {
  if (process.argv.length !== 2) throw new Error('arguments');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 65_536) throw new Error('config size');
    chunks.push(chunk);
  }
  const config = daemonConfig(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))));
  // The credential arrives only on stdin, never via argv/env inherited by Native Pi.
  const daemon = await listenDaemon({ ...config, harness: createPiHarness(config.launch) });
  const stop = () => { void daemon.close().then(result => {
    process.stdout.write(`${JSON.stringify({ shutdown: result })}\n`);
  }).catch(() => { process.exitCode = 1; }); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  process.stdout.write(`${JSON.stringify({ listening: { host: '127.0.0.1', port: daemon.port } })}\n`);
  await daemon.closed;
  process.removeListener('SIGINT', stop);
  process.removeListener('SIGTERM', stop);
}

main().catch(() => { process.stderr.write('daemon startup failed\n'); process.exitCode = 1; });
