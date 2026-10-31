import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import type { ChildProcess } from "node:child_process";
import {
  cleanup,
  closeApi,
  json,
  nextEvent,
  postJson,
  postEmpty,
  launches,
  provider,
  startApi,
  tempDir,
} from "./helpers.js";
import { createApiServer } from "../src/api/server.js";
import { SessionService } from "../src/core/session-service.js";
import { PiHarnessAdapter } from "../src/harness/pi-adapter.js";

afterEach(cleanup);
describe("Pi API v1", () => {
  it("strictly binds loopback and creates, submits, cancels, stops, and resumes exact native sessions", async () => {
    expect(() =>
      createApiServer(
        new SessionService(new PiHarnessAdapter(provider)),
        "0.0.0.0",
      ),
    ).toThrow();
    const { service, server, base } = await startApi();
    let child: ChildProcess | undefined;
    try {
      expect((await fetch(`${base}/api/v1/health`)).status).toBe(200);
      expect((await fetch(`${base}/api/v1/harnesses`)).status).toBe(200);
      const made = await json(
        await postJson(base, "/api/v1/sessions", {
          harnessId: "pi",
          cwd: await tempDir(),
        }),
      );
      const session = made.session as Record<string, unknown>;
      const id = String(session.id);
      expect(session.status).toBe("running");
      expect(session.nativeSessionId).toBe("native-exact");
      expect(
        (await fetch(`${base}/api/v1/sessions/${String(session.id)}`)).status,
      ).toBe(200);
      const socket = new WebSocket(
        base.replace("http", "ws") + `/api/v1/events?sessionId=${id}`,
      );
      await new Promise<void>((resolve) => socket.once("open", resolve));
      const acceptedEvent = nextEvent(socket, "input.state", "accepted");
      const completedEvent = nextEvent(socket, "input.state", "completed");
      const delta = nextEvent(socket, "assistant.delta");
      const input = await json(
        await postJson(base, `/api/v1/sessions/${id}/inputs`, {
          text: "hello",
        }),
      );
      expect((await acceptedEvent).data).toMatchObject({
        inputId: input.inputId,
        state: "accepted",
      });
      expect((await completedEvent).data).toMatchObject({
        inputId: input.inputId,
        state: "completed",
      });
      expect((await delta).data).toMatchObject({ text: "echo:hello" });
      const held = await json(
        await postJson(base, `/api/v1/sessions/${id}/inputs`, { text: "hold" }),
      );
      const cancel = (inputId: string) =>
        postJson(base, `/api/v1/sessions/${id}/cancel`, { inputId });
      expect(
        (await cancel("00000000-0000-4000-8000-000000000000")).status,
      ).toBe(409);
      const canceledEvent = nextEvent(socket, "input.state", "failed");
      expect((await cancel(String(held.inputId))).status).toBe(204);
      expect((await canceledEvent).data).toMatchObject({
        inputId: held.inputId,
        reason: "cancelled",
      });
      expect(
        (await postEmpty(base, `/api/v1/sessions/${id}/stop`)).status,
      ).toBe(204);
      expect(
        (await postEmpty(base, `/api/v1/sessions/${id}/resume`)).status,
      ).toBe(204);
      expect(launches.at(-1)?.args.slice(-2)).toEqual([
        "--session",
        "native-exact",
      ]);
      child = service.get(id).child;
      socket.close();
    } finally {
      await closeApi(server, service);
      expect(child?.exitCode !== null || child?.signalCode !== null).toBe(true);
    }
  });
});
