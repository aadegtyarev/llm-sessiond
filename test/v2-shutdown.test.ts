import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { createShutdown } from "../src/v2-shutdown.js";

describe("v2 shutdown ownership order", () => {
  it("closes admission, drains both providers, then releases once", async () => {
    const order: string[] = [];
    const server = createServer();
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const close = createShutdown(
      {
        runtime: {
          shutdown: async () => {
            order.push("runtime");
          },
        },
        service: {
          shutdown: async () => {
            order.push("service");
          },
        },
        lease: {
          release: async () => {
            order.push("lease");
          },
        },
      },
      server,
      new Set(),
    );
    const first = close();
    expect(close()).toBe(first);
    await first;
    expect(order).toEqual(["runtime", "service", "lease"]);
  });
  it("retains the lease if owned process drain is unconfirmed", async () => {
    let released = false;
    const server = createServer();
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const close = createShutdown(
      {
        runtime: {
          shutdown: async () => {
            throw Error("private");
          },
        },
        service: { shutdown: async () => {} },
        lease: {
          release: async () => {
            released = true;
          },
        },
      },
      server,
      new Set(),
    );
    await expect(close()).rejects.toThrow("PROCESS_DRAIN_UNCONFIRMED");
    expect(released).toBe(false);
  });
});
