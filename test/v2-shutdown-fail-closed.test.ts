import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { createShutdown } from "../src/v2-shutdown.js";
import { connectedServer, listen } from "./v2-shutdown-transport-fixture.js";

describe("v2 shutdown fails closed", () => {
  it("closes tracked upgraded sockets after synchronous owner failure", async () => {
    const { server, sockets, client, closed, idleSocket, idleClosed, agent } =
      await connectedServer();
    let serviceCalls = 0;
    let releaseCalls = 0;
    const close = createShutdown(
      {
        runtime: {
          shutdown: () => {
            throw Error("private");
          },
        },
        service: {
          shutdown: async () => {
            serviceCalls++;
          },
        },
        lease: {
          release: async () => {
            releaseCalls++;
          },
        },
      },
      server,
      sockets,
    );
    await expect(close()).rejects.toThrow("SHUTDOWN_UNCONFIRMED");
    await Promise.all([closed, idleClosed]);
    agent.destroy();
    expect(idleSocket.destroyed).toBe(true);
    expect(serviceCalls).toBe(1);
    expect(server.listening).toBe(false);
    expect(client.destroyed).toBe(true);
    expect(releaseCalls).toBe(0);
  });
  it("waits for every async owner before retaining the lease", async () => {
    let finish!: () => void;
    let released = false;
    const server = createServer();
    await listen(server);
    const close = createShutdown(
      {
        runtime: {
          shutdown: async () => {
            throw Error("private");
          },
        },
        service: {
          shutdown: () =>
            new Promise<void>((resolve) => {
              finish = resolve;
            }),
        },
        lease: {
          release: async () => {
            released = true;
          },
        },
      },
      server,
      new Set(),
    );
    const pending = close();
    await Promise.resolve();
    expect(released).toBe(false);
    finish();
    await expect(pending).rejects.toThrow("SHUTDOWN_UNCONFIRMED");
    expect(released).toBe(false);
  });
  it("does not retry a failed release on duplicate close", async () => {
    const server = createServer();
    await listen(server);
    let releases = 0;
    const close = createShutdown(
      {
        runtime: { shutdown: async () => {} },
        service: { shutdown: async () => {} },
        lease: {
          release: async () => {
            releases++;
            throw Error("private");
          },
        },
      },
      server,
      new Set(),
    );
    const first = close();
    expect(close()).toBe(first);
    await expect(first).rejects.toThrow("private");
    expect(releases).toBe(1);
  });
});
