import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
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
describe("protocol failure during pending submit", () => {
  it.each(["malformed-delay-ack", "oversized-delay-ack"])(
    "invalidates %s before its acknowledgement",
    async (text) => {
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
        const failed = nextEvent(socket, "session.status");
        const uncertain = nextEvent(socket, "input.state", "uncertain");
        const submitting = postJson(base, `/api/v1/sessions/${id}/inputs`, {
          text,
        });
        expect((await failed).data).toMatchObject({ status: "failed" });
        const response = await submitting;
        expect(response.status).toBe(409);
        expect(await json(response)).toMatchObject({
          error: { code: "INPUT_UNCERTAIN" },
        });
        expect((await uncertain).data).toMatchObject({ state: "uncertain" });
        expect(service.get(id).status).toBe("failed");
      } finally {
        socket?.close();
        await closeApi(server, service);
      }
    },
  );
});
