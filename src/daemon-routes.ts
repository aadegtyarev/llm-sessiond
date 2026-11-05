import type { SessionCore } from './core.ts';
import { ApiError, fields, lexicalId, replyBody, sessionId } from './daemon-schema.ts';

export function route(core: SessionCore, method: string, path: string, body: Record<string, unknown>) {
  if (path === '/sessions') {
    if (method === 'GET') return core.list();
    if (method === 'POST') { fields(body, ['sessionId']); return core.create(sessionId(body.sessionId)); }
    throw new ApiError(405, 'method');
  }
  const match = /^\/sessions\/([^/]+)(?:\/(start|send|reply|cancel|stop))?$/.exec(path);
  if (!match) throw new ApiError(404, 'route');
  const id = sessionId(match[1]);
  const operation = match[2];
  if (!operation && method === 'GET') return core.get(id);
  if (!operation) throw new ApiError(405, 'method');
  if (method !== 'POST') throw new ApiError(405, 'method');
  if (operation === 'reply') return core.reply(id, replyBody(body));
  if (operation === 'cancel') {
    fields(body, ['inputId']);
    return core.cancel(id, lexicalId(body.inputId));
  }
  if (operation === 'send') {
    fields(body, ['inputId', 'text']);
    const inputId = lexicalId(body.inputId);
    if (typeof body.text !== 'string') throw new ApiError(400, 'schema');
    return core.send(id, inputId, body.text);
  }
  fields(body, []);
  return operation === 'start' ? core.start(id) : core.stop(id);
}
