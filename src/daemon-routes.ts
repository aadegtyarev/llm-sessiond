import type { SessionCore } from './core.ts';
import { ApiError, fields, lexicalId, replyBody, sessionId } from './daemon-schema.ts';

export function route(core: SessionCore, method: string, path: string, body: Record<string, unknown>) {
  if (path === '/native-sessions') {
    if (method !== 'GET') throw new ApiError(405, 'method');
    return core.catalogue();
  }
  if (path === '/sessions') {
    if (method === 'GET') return core.list();
    if (method === 'POST') { fields(body, ['sessionId']); return core.create(sessionId(body.sessionId)); }
    throw new ApiError(405, 'method');
  }
  const match = /^\/sessions\/([^/]+)(?:\/(start|send|reply|cancel|stop|delete|register|models|settings|model|thinking-level|reload|compact))?$/.exec(path);
  if (!match) throw new ApiError(404, 'route');
  const id = sessionId(match[1]);
  const operation = match[2];
  if (!operation && method === 'GET') return core.get(id);
  if (!operation) throw new ApiError(405, 'method');
  if (operation === 'models' || operation === 'settings') {
    if (method !== 'GET') throw new ApiError(405, 'method');
    return operation === 'models' ? core.models(id) : core.settings(id);
  }
  if (method !== 'POST') throw new ApiError(405, 'method');
  if (operation === 'model') {
    fields(body, ['provider', 'modelId']);
    if (typeof body.provider !== 'string' || !body.provider || typeof body.modelId !== 'string' || !body.modelId) throw new ApiError(400, 'schema');
    return core.setModel(id, { provider: body.provider, modelId: body.modelId });
  }
  if (operation === 'thinking-level') {
    fields(body, ['level']);
    if (typeof body.level !== 'string' || !body.level) throw new ApiError(400, 'schema');
    return core.setThinkingLevel(id, body.level);
  }
  if (operation === 'compact') {
    fields(body, Object.hasOwn(body, 'instructions') ? ['instructions'] : []);
    if (Object.hasOwn(body, 'instructions') && typeof body.instructions !== 'string') throw new ApiError(400, 'schema');
    return core.compact(id, body.instructions as string | undefined);
  }
  if (operation === 'register') {
    fields(body, ['nativeId']);
    if (typeof body.nativeId !== 'string') throw new ApiError(400, 'schema');
    return core.register(id, body.nativeId);
  }
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
  if (operation === 'reload') return core.reload(id);
  if (operation === 'delete') { core.delete(id); return { deleted: true }; }
  return operation === 'start' ? core.start(id) : core.stop(id);
}
