import type { SessionCore } from './core.ts';
import { ApiError, commandBody, compactBody, fields, replyBody, sessionId } from './daemon-schema.ts';

export function route(core: SessionCore, method: string, path: string, body: Record<string, unknown>) {
  if (path === '/sessions') {
    if (method === 'GET') return core.list();
    if (method === 'POST') {
      const selected = Object.hasOwn(body, 'harness');
      fields(body, selected ? ['sessionId', 'harness'] : ['sessionId']);
      if (selected && (typeof body.harness !== 'string' || body.harness.length === 0)) throw new ApiError(400, 'schema');
      return core.create(sessionId(body.sessionId), selected ? body.harness as string : undefined);
    }
    throw new ApiError(405, 'method');
  }
  const match = /^\/sessions\/([^/]+)(?:\/(start|command|compact|reply|stop))?$/.exec(path);
  if (!match) throw new ApiError(404, 'route');
  const id = sessionId(match[1]);
  const operation = match[2];
  if (!operation && method === 'GET') return core.get(id);
  if (!operation) throw new ApiError(405, 'method');
  if (method !== 'POST') throw new ApiError(405, 'method');
  if (operation === 'command') {
    const command = commandBody(body);
    return core.command(id, { ...command, type: command.type });
  }
  if (operation === 'compact') return core.command(id, { ...compactBody(body), type: 'compact' });
  if (operation === 'reply') return core.reply(id, replyBody(body));
  fields(body, []);
  return operation === 'start' ? core.start(id) : core.stop(id);
}
