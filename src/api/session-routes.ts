import type { IncomingMessage, ServerResponse } from "node:http";
import { ApiError } from "../core/api-error.js";
import type { SessionService } from "../core/session-service.js";
import {
  cancelSchema,
  emptySchema,
  inputResponseSchema,
  inputSchema,
  sessionCreateSchema,
  sessionResponseSchema,
  sessionsResponseSchema,
} from "./schemas.js";
import {
  parseBody,
  readBody,
  sendJson,
  sessionSummary,
} from "./http-support.js";

export async function sessionRoute(
  service: SessionService,
  request: IncomingMessage,
  response: ServerResponse,
  path: string,
): Promise<void> {
  const method = request.method ?? "GET";
  if (method === "GET" && path === "/api/v1/sessions")
    return sendJson(
      response,
      200,
      { sessions: service.list().map(sessionSummary) },
      sessionsResponseSchema,
    );
  if (method === "POST" && path === "/api/v1/sessions") {
    const body = parseBody(sessionCreateSchema, await readBody(request));
    const session = await service.create(body.cwd, body.name);
    return sendJson(
      response,
      201,
      { session: sessionSummary(session) },
      sessionResponseSchema,
    );
  }
  const match =
    /^\/api\/v1\/sessions\/([^/]+)(?:\/(inputs|cancel|stop|resume))?$/.exec(
      path,
    );
  if (!match) throw new ApiError(404, "NOT_FOUND", "route not found");
  let id: string;
  try {
    id = decodeURIComponent(match[1] ?? "");
  } catch {
    throw new ApiError(400, "INVALID_PATH", "session id path is invalid");
  }
  const action = match[2];
  if (!action && method === "GET")
    return sendJson(
      response,
      200,
      { session: sessionSummary(service.get(id)) },
      sessionResponseSchema,
    );
  if (action === "inputs" && method === "POST") {
    const value = parseBody(inputSchema, await readBody(request));
    if (Buffer.byteLength(value.text, "utf8") > 256 * 1024)
      throw new ApiError(413, "LIMIT_EXCEEDED", "text exceeds size limit");
    const total =
      value.images?.reduce((sum, image) => {
        if (
          !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
            image.data,
          )
        )
          throw new ApiError(400, "VALIDATION_ERROR", "invalid base64 image");
        return sum + Buffer.from(image.data, "base64").length;
      }, 0) ?? 0;
    if (total > 20 * 1024 * 1024)
      throw new ApiError(413, "LIMIT_EXCEEDED", "images exceed size limit");
    const inputId = await service.input(id, {
      text: value.text,
      ...(value.images ? { images: value.images } : {}),
    });
    return sendJson(response, 202, { inputId }, inputResponseSchema);
  }
  if (action === "cancel" && method === "POST") {
    const value = parseBody(cancelSchema, await readBody(request));
    await service.cancel(id, value.inputId);
    return sendJson(response, 204);
  }
  if ((action === "stop" || action === "resume") && method === "POST") {
    parseBody(emptySchema, (await readBody(request)) ?? {});
    if (action === "stop") await service.stop(id);
    else await service.resume(id);
    return sendJson(response, 204);
  }
  throw new ApiError(404, "NOT_FOUND", "route not found");
}
