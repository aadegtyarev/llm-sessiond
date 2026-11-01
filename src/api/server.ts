import { createServer } from "node:http";
import { ApiError } from "../core/api-error.js";
import type { SessionService } from "../core/session-service.js";
import { sendJson } from "./http-support.js";
import { errorSchema } from "./schemas.js";
import { route } from "./routes.js";
import { attachWebSocket } from "./ws-server.js";
export function createApiServer(
  service: SessionService,
  host = process.env.HOST ?? "127.0.0.1",
) {
  if (host !== "127.0.0.1") throw new Error("HOST must be 127.0.0.1");
  const server = createServer(async (request, response) => {
    try {
      await route(service, request, response);
    } catch (error) {
      const api =
        error instanceof ApiError
          ? error
          : new ApiError(500, "INTERNAL_ERROR", "internal error");
      sendJson(
        response,
        api.status,
        {
          error: { code: api.code, message: api.message },
        },
        errorSchema,
      );
    }
  });
  server.on("clientError", (_error, socket) => socket.destroy());
  attachWebSocket(server, service);
  return server;
}
