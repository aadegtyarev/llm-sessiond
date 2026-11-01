import { afterEach, describe, expect, it } from "vitest";
import {
  cleanup,
  closeApi,
  json,
  nextEvent,
  postJson,
  startApi,
  tempDir,
} from "./helpers.js";

afterEach(cleanup);
describe("terminal cancellation releases the API input slot", () => {
  it.each(["abort-delay-settle", "abort-settle-before-ack"])(
    "allows submit B after %s",
    async (mode) => {
      const { service, server, base } = await startApi();
      let socket: import("ws").WebSocket | undefined;
      try {
        const created = await json(
          await postJson(base, "/api/v1/sessions", {
            harnessId: "pi",
            cwd: await tempDir(),
          }),
        );
        const id = String((created.session as Record<string, unknown>).id);
        socket = new (await import("ws")).WebSocket(
          `${base.replace("http", "ws")}/api/v1/events?sessionId=${id}`,
        );
        await new Promise<void>((resolve) => socket!.once("open", resolve));
        const first = await json(
          await postJson(base, `/api/v1/sessions/${id}/inputs`, { text: mode }),
        );
        const terminal = nextEvent(socket, "input.state", "failed");
        expect(
          (
            await postJson(base, `/api/v1/sessions/${id}/cancel`, {
              inputId: first.inputId,
            })
          ).status,
        ).toBe(204);
        expect((await terminal).data).toMatchObject({
          inputId: first.inputId,
          reason: "cancelled",
        });
        expect(service.get(id).currentInput).toBeUndefined();
        expect(
          (
            await postJson(base, `/api/v1/sessions/${id}/inputs`, {
              text: "hello",
            })
          ).status,
        ).toBe(202);
      } finally {
        socket?.close();
        await closeApi(server, service);
      }
    },
  );
});
