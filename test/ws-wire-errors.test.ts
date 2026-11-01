import net from "node:net";
import { WebSocket } from "ws";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanup,
  closeApi,
  json,
  postJson,
  startApi,
  tempDir,
} from "./helpers.js";

afterEach(cleanup);
async function closed(socket: net.Socket, label: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} socket not closed`)),
      2000,
    );
    socket.once("close", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
async function sendRawFrame(port: number): Promise<void> {
  const socket = net.connect(port, "127.0.0.1");
  socket.on("error", () => {});
  await new Promise<void>((resolve) => socket.once("connect", resolve));
  const close = closed(socket, "invalid frame");
  socket.once("data", (data) => {
    if (data.toString().includes("101 Switching"))
      socket.write(Buffer.from([0x81, 0x81, 1, 2, 3, 4, 0xfe]));
  });
  socket.write(
    `GET /api/v1/events HTTP/1.1\r\nHost: localhost:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`,
  );
  await close;
}
describe("WebSocket connection failures", () => {
  it("isolates oversized frames, invalid UTF-8, and malformed request targets", async () => {
    const { service, server, base } = await startApi();
    try {
      const made = await json(
        await postJson(base, "/api/v1/sessions", {
          harnessId: "pi",
          cwd: await tempDir(),
        }),
      );
      const id = String((made.session as Record<string, unknown>).id);
      const port = Number(new URL(base).port);
      const malformed = net.connect(port, "127.0.0.1");
      malformed.on("error", () => {});
      await new Promise<void>((resolve) => malformed.once("connect", resolve));
      const malformedClosed = closed(malformed, "malformed target");
      malformed.write(
        `GET http://[ HTTP/1.1\r\nHost: localhost:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`,
      );
      await malformedClosed;
      await sendRawFrame(port);
      const ws = new WebSocket(`${base.replace("http", "ws")}/api/v1/events`);
      ws.on("error", () => {});
      await new Promise<void>((resolve) => ws.once("open", resolve));
      const wsClosed = new Promise<void>((resolve) =>
        ws.once("close", () => resolve()),
      );
      ws.send(Buffer.alloc(5000));
      await wsClosed;
      expect((await fetch(`${base}/api/v1/health`)).status).toBe(200);
      expect((await fetch(`${base}/api/v1/sessions/${id}`)).status).toBe(200);
    } finally {
      await closeApi(server, service);
    }
  });
});
