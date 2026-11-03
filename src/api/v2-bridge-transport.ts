import { randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";
import type { Server } from "node:http";
import type { DurableSessionManager } from "../core/durable-session-manager.js";
import { sendFrame } from "./v2-bridge-peer.js";
import { V2BridgeHub } from "./v2-bridge-hub.js";
import { acceptV2Open } from "./v2-bridge-open.js";

export function attachV2Bridge(
  server: Server,
  manager: DurableSessionManager,
  instanceId: string,
  ready: () => void,
): (
  request: import("node:http").IncomingMessage,
  socket: import("node:stream").Duplex,
  head: Buffer,
) => boolean {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
  const hub = new V2BridgeHub(manager, instanceId, ready);
  wss.on("error", () => {});
  const peers = new Set<WebSocket>();
  server.on("close", () => {
    for (const peer of peers) peer.close(1001, "daemon shutdown");
    wss.close();
    hub.close();
  });
  return (request, socket, head) => {
    let path: string;
    try {
      path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    } catch {
      socket.destroy();
      return true;
    }
    if (path !== "/api/v2/bridge") return false;
    try {
      ready();
    } catch {
      socket.destroy();
      return true;
    }
    wss.handleUpgrade(request, socket, head, (client) => {
      peers.add(client);
      client.on("error", () => client.terminate());
      client.on("close", () => peers.delete(client));
      const connectionId = randomUUID();
      sendFrame(client, {
        apiVersion: "v2",
        type: "server.hello",
        protocolRevision: 1,
        instanceId,
        connectionId,
      });
      let detach: (() => void) | undefined;
      client.once("message", (data, binary) => {
        if (!acceptV2Open(client, data, binary, instanceId, connectionId))
          return;
        detach = hub.open(client, ready);
      });
      client.on("close", () => detach?.());
    });
    return true;
  };
}
