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
  const drains = [
    invoke(() => owners.runtime.shutdown()),
    invoke(() => owners.service.shutdown()),
  ];
  const transport = closeTransport(server, sockets, listening);
  const outcomes = await Promise.allSettled([...drains, transport]);
  if (outcomes.some((result) => result.status === "rejected"))
    throw new Error("SHUTDOWN_UNCONFIRMED");
  await owners.lease.release();
}

function invoke(action: () => Promise<void>): Promise<void> {
  try {
    return Promise.resolve(action());
  } catch {
    return Promise.reject(new Error("PROCESS_DRAIN_UNCONFIRMED"));
  }
}

function closeTransport(
  server: Server,
  sockets: Set<Socket>,
  listening: boolean,
): Promise<void> {
  let closed = Promise.resolve();
  let failed = false;
  if (listening) {
    try {
      closed = new Promise<void>((resolve) => server.close(() => resolve()));
    } catch {
      failed = true;
    }
    try {
      server.closeAllConnections();
    } catch {
      failed = true;
    }
  }
  for (const socket of sockets) {
    try {
      socket.destroy();
    } catch {
      failed = true;
    }
  }
  return closed.then(() => {
    if (failed) throw new Error("TRANSPORT_CLOSE_UNCONFIRMED");
  });
}
