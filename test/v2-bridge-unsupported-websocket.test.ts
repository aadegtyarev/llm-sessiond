import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createSessionCycleFixture } from "./v2-http-session-cycle-fixture.js";
import { waitForFrames } from "./v2-bridge-wait.js";

describe("real websocket strict unsupported validation", () => {
  let fixture: Awaited<ReturnType<typeof createSessionCycleFixture>>;
  afterEach(async () => {
    if (fixture) await fixture.dispose();
  });

  async function openedSocket(): Promise<{
    socket: WebSocket;
    frames: Record<string, unknown>[];
  }> {
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
    return { socket, frames };
  }

  it.each([
    [
      "array type",
      {
        apiVersion: "v2",
        type: ["guard.set"],
        requestId: "g",
        contextId: "ctx",
        generation: 1,
        sessionId: null,
      },
    ],
    [
      "missing guard context",
      {
        apiVersion: "v2",
        type: "guard.set",
        requestId: "g",
        generation: 1,
        sessionId: null,
      },
    ],
  ])("closes after %s without a failure frame", async (_name, frame) => {
    const { socket, frames } = await openedSocket();
    const closed = new Promise<number>((resolve) =>
      socket.once("close", (code) => resolve(code)),
    );
    socket.send(JSON.stringify(frame));
    expect(await closed).toBe(1002);
    expect(
      frames.some(
        (item) => item.type === "request.failed" && item.requestId === "g",
      ),
    ).toBe(false);
  });
});
