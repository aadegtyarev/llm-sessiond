import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import type { ChildProcess } from "node:child_process";
import {
  cleanup,
  closeApi,
  json,
  nextEvent,
  postEmpty,
  postJson,
  startApi,
  tempDir,
} from "./helpers.js";

afterEach(cleanup);
describe("stopping active inputs", () => {
  it("reports uncertain delivery and cleans the Pi child", async () => {
    const { service, server, base } = await startApi();
    let child: ChildProcess | undefined;
    try {
      const created = await json(
        await postJson(base, "/api/v1/sessions", {
          harnessId: "pi",
          cwd: await tempDir(),
        }),
      );
      const session = created.session as Record<string, unknown>;
      const id = String(session.id);
      child = service.get(id).child;
      const socket = new WebSocket(
        `${base.replace("http", "ws")}/api/v1/events?sessionId=${id}`,
      );
      await new Promise<void>((resolve) => socket.once("open", resolve));
      const uncertain = nextEvent(socket, "input.state", "uncertain");
      const input = await json(
        await postJson(base, `/api/v1/sessions/${id}/inputs`, { text: "hold" }),
      );
      expect(
        (await postEmpty(base, `/api/v1/sessions/${id}/stop`)).status,
      ).toBe(204);
      expect((await uncertain).data).toMatchObject({
        inputId: input.inputId,
        state: "uncertain",
      });
      expect(service.get(id).status).toBe("stopped");
      socket.close();
    } finally {
      await closeApi(server, service);
      expect(child?.exitCode !== null || child?.signalCode !== null).toBe(true);
    }
  });
});
