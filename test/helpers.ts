import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { WebSocket } from "ws";
import type { Server } from "node:http";
import { createApiServer } from "../src/api/server.js";
import { SessionService } from "../src/core/session-service.js";
import type { ProcessProvider } from "../src/core/ports.js";
import { PiHarnessAdapter } from "../src/harness/pi-adapter.js";

export const fixture = path.resolve("test/fixtures/fake-pi.mjs");
export const dirs: string[] = [];
export const launches: { args: string[]; cwd: string }[] = [];
export const provider: ProcessProvider = {
  launch: (_exe, args, cwd) => {
    launches.push({ args, cwd });
    return spawn(process.execPath, [fixture, ...args], {
      cwd,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
  },
};
export async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "sessiond-"));
  dirs.push(dir);
  return dir;
}
export async function cleanup(): Promise<void> {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
}
export async function startApi(host = "127.0.0.1") {
  const service = new SessionService(new PiHarnessAdapter(provider, "fake-pi"));
  const server = createApiServer(service, host);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("missing address");
  return { service, server, base: `http://127.0.0.1:${address.port}` };
}
export async function closeApi(
  server: Server,
  service: SessionService,
): Promise<void> {
  await service.shutdown();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
export function postJson(
  base: string,
  route: string,
  body: unknown,
): Promise<Response> {
  return fetch(`${base}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
export function postEmpty(base: string, route: string): Promise<Response> {
  return fetch(`${base}${route}`, { method: "POST" });
}
export const json = async (
  response: Response,
): Promise<Record<string, unknown>> =>
  response.json() as Promise<Record<string, unknown>>;
export function nextEvent(
  socket: WebSocket,
  type: string,
  state?: string,
): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const onMessage = (data: Buffer) => {
      const item = JSON.parse(data.toString()) as Record<string, unknown>;
      if (
        item.type === type &&
        (!state || (item.data as Record<string, unknown>)?.state === state)
      ) {
        socket.off("message", onMessage);
        resolve(item);
      }
    };
    socket.on("message", onMessage);
  });
}
