import type { Server } from "node:http";
import { createApiServer } from "../src/api/server.js";
import type { SessionService } from "../src/core/session-service.js";
import { expect } from "vitest";

export async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("missing address");
  return `http://127.0.0.1:${address.port}`;
}
export async function assertLegacyV1(service: SessionService): Promise<void> {
  const server = createApiServer(service, "127.0.0.1");
  const base = await listen(server);
  try {
    expect(await fetch(`${base}/api/v1/health`).then((r) => r.json())).toEqual({
      apiVersion: "v1",
      status: "ready",
      version: "0.1.0",
    });
    expect((await fetch(`${base}/api/v2/health`)).status).toBe(404);
  } finally {
    await close(server);
  }
}
export async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
