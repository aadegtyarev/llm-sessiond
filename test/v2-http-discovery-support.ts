import type { Server } from "node:http";
import { createApiServer } from "../src/api/server.js";
import type { SessionService } from "../src/core/session-service.js";
import type { V2DiscoveryRuntime } from "../src/api/v2-discovery.js";
import { expect } from "vitest";
import { safeError } from "./v2-schema-common.js";

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
export async function expectSafeError(
  response: Response,
  status: number,
  category: "not-found" | "unavailable",
) {
  expect(response.status).toBe(status);
  const error = safeError.parse(await response.json());
  expect(error.category).toBe(category);
  expect(error.outcome).toBe("not-applied");
  expect(error.reference.length).toBeGreaterThan(0);
  return error;
}
export async function assertFreshBootAndClosing(
  service: SessionService,
  runtime: V2DiscoveryRuntime & { shutdown(): Promise<void> },
  base: string,
  oldInstanceId: string,
): Promise<void> {
  const server = createApiServer(service, "127.0.0.1", runtime);
  const freshBase = await listen(server);
  try {
    const health = await fetch(`${freshBase}/api/v2/health`).then((r) =>
      r.json(),
    );
    expect(health.instanceId).not.toBe(oldInstanceId);
  } finally {
    await close(server);
  }
  const shutting = runtime.shutdown();
  await expectSafeError(
    await fetch(`${base}/api/v2/health`),
    503,
    "unavailable",
  );
  await shutting;
}
export async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
