import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createSessionCycleFixture } from "./v2-http-session-cycle-fixture.js";
import { waitForFrames } from "./v2-bridge-wait.js";
describe("opened v2 bridge frame handling", () => {
  let fixture: Awaited<ReturnType<typeof createSessionCycleFixture>>;
  afterEach(async () => {
    if (fixture) await fixture.dispose();
  });
  it("closes after invalid UTF-8 text following the open snapshot", async () => {
    fixture = await createSessionCycleFixture();
    const socket = new WebSocket(
      fixture.base.replace("http", "ws") + "/api/v2/bridge",
    );
    const frames: unknown[] = [];
    socket.on("message", (data) => frames.push(data));
    await new Promise<void>((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });
    socket.send(
      JSON.stringify({
        apiVersion: "v2",
        type: "client.open",
        requestId: "open",
        protocolRevision: 1,
        callbacks: [],
      }),
    );
    await waitForFrames(frames, 4);
    const closed = new Promise<number>((resolve) =>
      socket.once("close", (code) => resolve(code)),
    );
    socket.send(Buffer.from([0xff]), { binary: false });
    expect([1002, 1007]).toContain(await closed);
  });
  it("safely rejects unsupported writes without ACK and rejects a duplicate open", async () => {
    fixture = await createSessionCycleFixture();
    const socket = new WebSocket(
      fixture.base.replace("http", "ws") + "/api/v2/bridge",
    );
    const frames: Record<string, unknown>[] = [];
    socket.on("message", (data) =>
      frames.push(JSON.parse(data.toString()) as Record<string, unknown>),
    );
    await new Promise<void>((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });
    await waitForFrames(frames, 1);
    socket.send(
      JSON.stringify({
        apiVersion: "v2",
        type: "client.open",
        requestId: "open",
        protocolRevision: 1,
        callbacks: [],
      }),
    );
    await waitForFrames(frames, 4);
    socket.send(
      JSON.stringify({
        apiVersion: "v2",
        type: "guard.set",
        requestId: "guard-1",
        contextId: "ctx",
        generation: 1,
        sessionId: null,
      }),
    );
    await waitForFrames(frames, 5);
    expect(frames[4]).toMatchObject({
      type: "request.failed",
      requestId: "guard-1",
      error: { category: "unsupported", outcome: "not-applied" },
    });
    expect(
      frames.some(
        (frame) =>
          frame.type === "request.succeeded" && frame.requestId === "guard-1",
      ),
    ).toBe(false);
    const closed = new Promise<number>((resolve) =>
      socket.once("close", (code) => resolve(code)),
    );
    socket.send(
      JSON.stringify({
        apiVersion: "v2",
        type: "client.open",
        requestId: "duplicate",
        protocolRevision: 1,
        callbacks: [],
      }),
    );
    expect(await closed).toBe(1002);
  });
});
