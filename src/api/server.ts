import { createServer } from "node:http";
import { ApiError } from "../core/api-error.js";
import type { SessionService } from "../core/session-service.js";
import { sendJson } from "./http-support.js";
import { errorSchema } from "./schemas.js";
import { route } from "./routes.js";
import { attachWebSocket } from "./ws-server.js";
import { createV2Discovery, type V2DiscoveryRuntime } from "./v2-discovery.js";
export function createApiServer(
  service: SessionService,
  host = process.env.HOST ?? "127.0.0.1",
  v2Runtime?: V2DiscoveryRuntime,
) {
  if (host !== "127.0.0.1") throw new Error("HOST must be 127.0.0.1");
  const discover = v2Runtime ? createV2Discovery(v2Runtime) : undefined;
  const server = createServer(async (request, response) => {
    try {
      await route(service, request, response, discover);
    } catch (error) {
      const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      const isV2 =
        !!discover && (path === "/api/v2" || path.startsWith("/api/v2/"));
      if (isV2) {
        const unavailable = !(error instanceof ApiError);
        const status = unavailable ? 503 : error.status;
        sendJson(response, status, {
          code: unavailable ? "UNAVAILABLE" : error.code,
          message: unavailable ? "service unavailable" : error.message,
          category: unavailable ? "unavailable" : "not-found",
          outcome: "not-applied",
        });
        return;
      }
      const api =
        error instanceof ApiError
          ? error
          : new ApiError(500, "INTERNAL_ERROR", "internal error");
      sendJson(
        response,
        api.status,
        { error: { code: api.code, message: api.message } },
        errorSchema,
      );
    }
  });
  server.on("clientError", (_error, socket) => socket.destroy());
  attachWebSocket(server, service);
  return server;
}
