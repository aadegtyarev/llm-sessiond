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
  it("serializes stop and resume so a second Pi process starts only after cleanup", async () => {
    const { service, server, base } = await startApi();
    try {
      const created = await json(
        await postJson(base, "/api/v1/sessions", {
          harnessId: "pi",
          cwd: await tempDir(),
        }),
      );
      const id = String((created.session as Record<string, unknown>).id);
      const oldChild = service.get(id).child;
      const stopping = postEmpty(base, `/api/v1/sessions/${id}/stop`);
      const deadline = Date.now() + 5000;
      while (service.get(id).status !== "stopped") {
        if (Date.now() > deadline) throw new Error("stop did not begin");
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      const resuming = postEmpty(base, `/api/v1/sessions/${id}/resume`);
      expect((await stopping).status).toBe(204);
      expect((await resuming).status).toBe(204);
      expect(oldChild).toBeDefined();
      expect(oldChild?.exitCode ?? oldChild?.signalCode).not.toBeNull();
      expect(service.get(id).status).toBe("running");
    } finally {
      await closeApi(server, service);
    }
  });
  it("invalidates a pending submit when stop advances the runtime generation", async () => {
    const { service, server, base } = await startApi();
    try {
      const created = await json(
        await postJson(base, "/api/v1/sessions", {
          harnessId: "pi",
          cwd: await tempDir(),
        }),
      );
      const id = String((created.session as Record<string, unknown>).id);
      const submitting = postJson(base, `/api/v1/sessions/${id}/inputs`, {
        text: "delay-ack",
      });
      const deadline = Date.now() + 2000;
      while (service.get(id).pendingSubmit === undefined) {
        if (Date.now() > deadline)
          throw new Error("submit did not become pending");
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      expect(
        (await postEmpty(base, `/api/v1/sessions/${id}/stop`)).status,
      ).toBe(204);
      const result = await submitting;
      expect(result.status).toBe(409);
      expect(await json(result)).toMatchObject({
        error: { code: "INPUT_UNCERTAIN" },
      });
      expect(service.get(id).currentInput).toBeUndefined();
    } finally {
      await closeApi(server, service);
    }
  });
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
      expect(child).toBeDefined();
      expect(child?.exitCode ?? child?.signalCode).not.toBeNull();
    }
  });
});
