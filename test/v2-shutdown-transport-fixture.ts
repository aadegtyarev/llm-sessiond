import { Agent, createServer, request } from "node:http";
import { createConnection } from "node:net";

export async function listen(
  server: ReturnType<typeof createServer>,
): Promise<void> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
}
export async function connectedServer() {
  const server = createServer((_request, response) => response.end("ok"));
  const sockets = new Set<import("node:net").Socket>();
  let resolveUpgrade!: () => void;
  const upgradedPromise = new Promise<void>((resolve) => {
    resolveUpgrade = resolve;
  });
  server.on("upgrade", () => resolveUpgrade());
  server.on("connection", (socket) => sockets.add(socket));
  await listen(server);
  const address = server.address();
  if (!address || typeof address === "string") throw Error();
  const client = createConnection(address.port, "127.0.0.1");
  const closed = new Promise<void>((resolve) => client.once("close", resolve));
  await new Promise<void>((resolve) => client.once("connect", resolve));
  client.write(
    [
      "GET /events HTTP/1.1",
      "Host: 127.0.0.1",
      "Connection: Upgrade",
      "Upgrade: websocket",
      "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
      "Sec-WebSocket-Version: 13",
      "",
      "",
    ].join(`${String.fromCharCode(13)}${String.fromCharCode(10)}`),
  );
  await upgradedPromise;
  const agent = new Agent({ keepAlive: true });
  let idleSocket: import("node:net").Socket | undefined;
  await new Promise((resolve) => {
    const response = request(
      { host: "127.0.0.1", port: address.port, agent },
      (result) => {
        result.resume();
        result.once("end", resolve);
      },
    );
    response.once("socket", (socket) => {
      idleSocket = socket as import("node:net").Socket;
    });
    response.end();
  });
  if (!idleSocket) throw Error();
  const idleClosed = new Promise<void>((resolve) =>
    idleSocket!.once("close", resolve),
  );
  return { server, sockets, client, closed, idleSocket, idleClosed, agent };
}
