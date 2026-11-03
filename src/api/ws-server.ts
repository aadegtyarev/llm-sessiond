import { WebSocket, WebSocketServer } from "ws";
import type { Server } from "node:http";
import type { SessionService } from "../core/session-service.js";
import { exceedsWebSocketBufferLimit } from "./ws-backpressure.js";

export function attachWebSocket(
  server: Server,
  service: SessionService,
  v2Upgrade?: (
    request: import("node:http").IncomingMessage,
    socket: import("node:stream").Duplex,
    head: Buffer,
  ) => boolean,
): void {
  const ws = new WebSocketServer({ noServer: true, maxPayload: 4096 }).on(
    "error",
    () => {},
  );
  const clients = new Set<{
    socket: WebSocket;
    sessionId: string | undefined;
  }>();
  ws.on("connection", (socket, request) => {
    socket.on("error", () => socket.terminate());
    let sessionId: string | undefined;
    try {
      sessionId =
        new URL(request.url ?? "/", "http://127.0.0.1").searchParams.get(
          "sessionId",
        ) ?? undefined;
    } catch {
      socket.close(1002, "invalid request target");
      return;
    }
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
    let url: URL;
    try {
      url = new URL(request.url ?? "/", "http://127.0.0.1");
    } catch {
      socket.destroy();
      return;
    }
    if (url.pathname !== "/api/v1/events") {
      if (!v2Upgrade?.(request, socket, head)) socket.destroy();
      return;
    }
    try {
      ws.handleUpgrade(request, socket, head, (client) =>
        ws.emit("connection", client, request),
      );
    } catch {
      socket.destroy();
    }
  });
}
