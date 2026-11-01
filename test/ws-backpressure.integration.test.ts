import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import {
  cleanup,
  closeApi,
  json,
  postJson,
  startApi,
  tempDir,
} from "./helpers.js";

afterEach(cleanup);
describe("queued WebSocket events", () => {
  it("closes a paused client when outbound frames exceed the queue budget", async () => {
    const { service, server, base } = await startApi();
    let socket: WebSocket | undefined;
    try {
      const created = await json(
        await postJson(base, "/api/v1/sessions", {
          harnessId: "pi",
          cwd: await tempDir(),
        }),
      );
      const id = String((created.session as Record<string, unknown>).id);
      socket = new WebSocket(
        `${base.replace("http", "ws")}/api/v1/events?sessionId=${id}`,
      );
      await new Promise<void>((resolve) => socket!.once("open", resolve));
      const tcp = (socket as unknown as { _socket: import("node:net").Socket })
        ._socket;
      tcp.pause();
      const closed = new Promise<number>((resolve) =>
        socket!.once("close", (code) => resolve(code)),
      );
      for (let i = 0; i < 128; i++)
        service.events.publish(id, "notification", {
          text: "x".repeat(64 * 1024),
        });
      tcp.resume();
      expect(await closed).toBe(1013);
    } finally {
      socket?.terminate();
      await closeApi(server, service);
    }
  });
});
