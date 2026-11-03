import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createSessionCycleFixture } from "./v2-http-session-cycle-fixture.js";

describe("v2 observation bridge transport", () => {
  let fixture: Awaited<ReturnType<typeof createSessionCycleFixture>>;
  afterEach(async () => {
    if (fixture) await fixture.dispose();
  });
  it("pins hello to HTTP boot and acknowledges open before the snapshot barrier", async () => {
    fixture = await createSessionCycleFixture();
    const health = (await fetch(`${fixture.base}/api/v2/health`).then((r) =>
      r.json(),
    )) as { instanceId: string };
    const socket = new WebSocket(
      fixture.base.replace("http", "ws") + "/api/v2/bridge",
    );
    const frames: Record<string, unknown>[] = [];
    socket.on("message", (data) =>
      frames.push(JSON.parse(data.toString()) as Record<string, unknown>),
    );
    const waitFor = async (count: number) => {
      const until = Date.now() + 3000;
      while (frames.length < count && Date.now() < until)
        await new Promise((resolve) => setTimeout(resolve, 5));
      expect(frames.length).toBeGreaterThanOrEqual(count);
    };
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once("open", resolve);
        socket.once("error", reject);
      });
      await waitFor(1);
      expect(frames[0]).toMatchObject({
        type: "server.hello",
        instanceId: health.instanceId,
      });
      socket.send(
        JSON.stringify({
          apiVersion: "v2",
          type: "client.open",
          requestId: "open-1",
          protocolRevision: 1,
          callbacks: [],
        }),
      );
      await waitFor(4);
      expect(frames.slice(1).map((frame) => frame.type)).toEqual([
        "request.succeeded",
        "snapshot.begin",
        "snapshot.end",
      ]);
      expect(frames[1]).toMatchObject({
        requestId: "open-1",
        result: { instanceId: health.instanceId },
      });
      expect(frames[2]).toMatchObject({ afterSequence: 0 });
      await fixture.runtime.manager?.create({ cwd: fixture.dir });
      await waitFor(5);
      expect(frames.slice(4).every((frame) => frame.type === "event")).toBe(
        true,
      );
      expect(frames.slice(4).map((frame) => frame.sequence)).toEqual([1, 2, 3]);
      expect(frames[4]).toMatchObject({
        type: "event",
        event: { kind: "session.changed" },
      });
    } finally {
      socket.close();
    }
    expect(fixture.effects().stops).toBe(0);
  });
});
