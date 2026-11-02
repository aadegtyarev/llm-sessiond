import type { Server } from "node:http";
import type { Socket } from "node:net";

export interface ShutdownOwners {
  runtime: { shutdown(): Promise<void> };
  service: { shutdown(): Promise<void> };
  lease: { release(): Promise<void> };
}

export function createShutdown(
  owners: ShutdownOwners,
  server: Server,
  sockets: Set<Socket>,
): () => Promise<void> {
  let closing: Promise<void> | undefined;
  return () => {
    closing ??= shutdownOnce(owners, server, sockets);
    return closing;
  };
}

async function shutdownOnce(
  owners: ShutdownOwners,
  server: Server,
  sockets: Set<Socket>,
): Promise<void> {
  const listening = server.listening;
  const stopped = Promise.allSettled([
    owners.runtime.shutdown(),
    owners.service.shutdown(),
  ]);
  let closed = Promise.resolve();
  if (listening) {
    closed = new Promise<void>((resolve) => server.close(() => resolve()));
    server.closeAllConnections();
  }
  for (const socket of sockets) socket.destroy();
  const outcomes = await stopped;
  await closed;
  if (outcomes.some((result) => result.status === "rejected"))
    throw new Error("PROCESS_DRAIN_UNCONFIRMED");
  await owners.lease.release();
}
