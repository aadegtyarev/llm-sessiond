import { createServer } from "node:http";
import { ApiError } from "../core/api-error.js";
import type { SessionService } from "../core/session-service.js";
import { sendJson } from "./http-support.js";
import { errorSchema } from "./schemas.js";
import { route } from "./routes.js";
import { attachWebSocket } from "./ws-server.js";
import { sendV2Error } from "./v2-error.js";
import { createV2Discovery, type V2DiscoveryRuntime } from "./v2-discovery.js";
import { attachV2Bridge } from "./v2-bridge-transport.js";
export function createApiServer(
  service: SessionService,
  host = process.env.HOST ?? "127.0.0.1",
  v2Runtime?: V2DiscoveryRuntime,
) {
  if (host !== "127.0.0.1") throw new Error("HOST must be 127.0.0.1");
  const discover = v2Runtime ? createV2Discovery(v2Runtime) : undefined;
  const server = createServer(async (request, response) => {
    try {
      const result = await route(service, request, response, discover);
      if (result === "v2-not-found") {
        sendV2Error(response, 404);
        return;
      }
    } catch (error) {
      const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      const isV2 =
        !!discover && (path === "/api/v2" || path.startsWith("/api/v2/"));
      if (isV2) {
        sendV2Error(response, 503);
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
  const v2Upgrade =
    discover && v2Runtime?.manager
      ? attachV2Bridge(
          server,
          v2Runtime.manager,
          discover.instanceId,
          v2Runtime.assertReady,
        )
      : undefined;
  attachWebSocket(server, service, v2Upgrade);
  return server;
}
