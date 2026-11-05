import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { ApiError, BODY_LIMIT, record } from './daemon-schema.ts';

export async function requestBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const length = request.headers['content-length'];
  if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > BODY_LIMIT)) {
    throw new ApiError(413, 'body-too-large');
  }
  if (request.method === 'GET') {
    if (request.headers['transfer-encoding'] || Number(length ?? 0) !== 0) throw new ApiError(400, 'schema');
    return {};
  }
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers['content-type'] ?? '')) {
    throw new ApiError(415, 'content-type');
  }
  const chunks = await new Promise<Buffer[]>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const cleanup = () => {
      request.off('data', data); request.off('end', end); request.off('aborted', fail);
    };
    const fail = () => { cleanup(); reject(new ApiError(400, 'transport')); };
    const end = () => { cleanup(); resolve(chunks); };
    const data = (chunk: Buffer) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        cleanup(); request.resume(); reject(new ApiError(413, 'body-too-large'));
      } else chunks.push(chunk);
    };
    request.on('data', data); request.once('end', end); request.once('aborted', fail);
    request.once('error', fail);
  });
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
    return record(JSON.parse(text));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'json');
  }
}

export function authenticate(request: IncomingMessage, token: string) {
  const count = request.rawHeaders.filter((_, i) => i % 2 === 0
    && request.rawHeaders[i].toLowerCase() === 'authorization').length;
  const header = request.headers.authorization ?? '';
  const match = /^Bearer ([A-Za-z0-9_-]{32,256})$/i.exec(header);
  const supplied = Buffer.from(match?.[1] ?? '');
  const expected = Buffer.from(token);
  if (count !== 1 || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new ApiError(401, 'auth');
  }
}
