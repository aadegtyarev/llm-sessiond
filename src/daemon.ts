import { createServer, type ServerResponse } from 'node:http';
import { SessionCore, CoreError, type HarnessPort, type HarnessRegistry } from './core.ts';
import { authenticate, requestBody } from './daemon-request.ts';
import { ApiError, fields } from './daemon-schema.ts';
import { openEventStream, STREAM_CLIENTS } from './daemon-stream.ts';
import { route } from './daemon-routes.ts';

export interface DaemonOptions { token: string; port: number; harness: HarnessPort | HarnessRegistry }

export async function listenDaemon({ token, port, harness }: DaemonOptions) {
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(token) || !Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('invalid daemon settings');
  }
  const server = createServer({ maxHeaderSize: 8192, requestTimeout: 15_000, headersTimeout: 10_000 });
  const core = new SessionCore(harness);
  const streams = new Set<() => void>();
  let shutdownTask: ReturnType<SessionCore['shutdown']> | undefined;
  server.on('clientError', (_error, socket) => {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  });
  function shutdown() {
    return shutdownTask ??= core.shutdown();
  }
  function finish() {
    for (const end of streams) end();
    server.close();
    server.closeIdleConnections();
  }
  server.on('request', (request, response) => {
    response.on('error', () => response.destroy());
    void (async () => {
      authenticate(request, token);
      if (shutdownTask) throw new ApiError(503, 'closed');
      const path = request.url ?? '';
      if (!path.startsWith('/') || /[?#%]/.test(path) || request.headers.origin) {
        throw new ApiError(400, 'transport');
      }
      if (request.method !== 'GET' && request.method !== 'POST') throw new ApiError(405, 'method');
      const body = await requestBody(request);
      if (shutdownTask) throw new ApiError(503, 'closed');
      if (path === '/events') {
        if (request.method !== 'GET') throw new ApiError(405, 'method');
        if (streams.size >= STREAM_CLIENTS) throw new ApiError(503, 'stream-limit');
        let end = () => {};
        end = openEventStream(core, response, () => streams.delete(end));
        if (response.destroyed) end(); else streams.add(end);
        return;
      }
      if (path === '/shutdown') {
        if (request.method !== 'POST') throw new ApiError(405, 'method');
        fields(body, []);
        const result = await shutdown();
        json(response, 200, result);
        finish();
        return;
      }
      json(response, 200, await route(core, request.method ?? '', path, body));
    })().catch(error => {
      if (response.headersSent || response.destroyed) { response.destroy(); return; }
      const status = error instanceof ApiError ? error.status : error instanceof CoreError ? 409 : 500;
      const code = error instanceof ApiError || error instanceof CoreError ? error.code : 'internal';
      response.setHeader('Connection', 'close');
      if (status === 401) response.setHeader('WWW-Authenticate', 'Bearer');
      json(response, status, { error: { code } });
      request.resume();
    });
  });
  let address;
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => { server.off('error', reject); resolve(); });
    });
    address = server.address();
    if (!address || typeof address === 'string') throw new Error('invalid address');
  } catch (error) {
    // Close the local lifecycle and listener if binding fails.
    try { await shutdown(); }
    finally { await new Promise<void>(resolve => server.close(() => resolve())); }
    throw error;
  }
  return {
    port: address.port,
    closed: new Promise<void>(resolve => server.once('close', resolve)),
    async close() { const result = await shutdown(); finish(); return result; },
  };
}

function json(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(value));
}
