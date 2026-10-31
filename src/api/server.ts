import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { ApiError } from "../core/api-error.js";
import type { SessionService } from "../core/session-service.js";
import { sendJson } from "./http-support.js";
import { errorSchema } from "./schemas.js";
import { route } from "./routes.js";
import { exceedsWebSocketBufferLimit } from "./ws-backpressure.js";
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
  const ws = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  const clients = new Set<{
    socket: WebSocket;
    sessionId: string | undefined;
  }>();
  ws.on("connection", (socket, request) => {
    const sessionId =
      new URL(request.url ?? "/", "http://127.0.0.1").searchParams.get(
        "sessionId",
      ) ?? undefined;
    if (sessionId && !service.sessions.has(sessionId)) {
      socket.close(1008, "unknown session");
      return;
    }
    const client = { socket, sessionId };
    clients.add(client);
    socket.on("close", () => clients.delete(client));
  });
  service.events.on("event", (event) => {
    const message = JSON.stringify(event);
    const bytes = Buffer.byteLength(message);
    for (const client of clients) {
      if (client.sessionId && client.sessionId !== event.sessionId) continue;
      if (client.socket.readyState !== WebSocket.OPEN) continue;
      if (exceedsWebSocketBufferLimit(client.socket.bufferedAmount, bytes))
        client.socket.close(1013, "slow client");
      else {
        try {
          client.socket.send(message);
        } catch {
          client.socket.terminate();
          clients.delete(client);
        }
      }
    }
  });
  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== "/api/v1/events") {
      socket.destroy();
      return;
    }
    ws.handleUpgrade(request, socket, head, (client) =>
      ws.emit("connection", client, request),
    );
  });
  return server;
}
