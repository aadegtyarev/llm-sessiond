import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import {
  cleanup,
  closeApi,
  json,
  nextEvent,
  startApi,
  tempDir,
} from "./helpers.js";

afterEach(cleanup);
describe("concurrent sessions", () => {
  it("keeps independent sessions concurrent and rejects unknown fields", async () => {
    const { service, server, base } = await startApi();
    try {
      const cwd = await tempDir();
      const make = (extra = false) =>
        fetch(`${base}/api/v1/sessions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            harnessId: "pi",
            cwd,
            ...(extra ? { unknown: true } : {}),
          }),
        });
      expect((await make(true)).status).toBe(400);
      const [a, b] = await Promise.all([make(), make()]);
      const [one, two] = await Promise.all([json(a), json(b)]);
      const first = one.session as Record<string, unknown>;
      const second = two.session as Record<string, unknown>;
      expect(first.id).not.toBe(second.id);
      const send = (id: unknown, text: string) =>
        fetch(`${base}/api/v1/sessions/${String(id)}/inputs`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        });
      expect(
        (
          await Promise.all([send(first.id, "one"), send(second.id, "two")])
        ).map((response) => response.status),
      ).toEqual([202, 202]);
    } finally {
      await closeApi(server, service);
    }
  });
  it("filters WebSocket events by the optional sessionId", async () => {
    const { service, server, base } = await startApi();
    try {
      const cwd = await tempDir();
      const create = async () =>
        json(
          await fetch(`${base}/api/v1/sessions`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ harnessId: "pi", cwd }),
          }),
        );
      const one = (await create()).session as Record<string, unknown>;
      const two = (await create()).session as Record<string, unknown>;
      const socket = new WebSocket(
        `${base.replace("http", "ws")}/api/v1/events?sessionId=${String(one.id)}`,
      );
      await new Promise<void>((resolve) => socket.once("open", resolve));
      const delta = nextEvent(socket, "assistant.delta");
      const submit = (id: unknown, text: string) =>
        fetch(`${base}/api/v1/sessions/${String(id)}/inputs`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        });
      await submit(two.id, "other");
      await submit(one.id, "selected");
      expect((await delta).data).toMatchObject({ text: "echo:selected" });
      socket.close();
    } finally {
      await closeApi(server, service);
    }
  });
});
