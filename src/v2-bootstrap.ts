import { createServer } from "node:http";
import path from "node:path";
import { createApiServer } from "./api/server.js";
import { SessionService } from "./core/session-service.js";
import { reconcileStartup } from "./core/startup-reconciliation.js";
import { createBuiltinDurableRuntime } from "./harness/builtin-durable-runtime.js";
import { OwnedStoreLease } from "./persistence/owned-store.js";
import { prepareStateDirectory } from "./persistence/private-state-directory.js";
import { resolveStateDirectory } from "./persistence/state-directory.js";
import { openSessionDatabase } from "./persistence/sqlite-database.js";
import { SessionRepository } from "./persistence/session-repository.js";
import { ConfirmedProcessProvider } from "./process/confirmed-provider.js";
import { NodeProcessProvider } from "./process/node-provider.js";
import { PiHarnessAdapter } from "./harness/pi-adapter.js";
import { createShutdown } from "./v2-shutdown.js";

export function isCleanStartupCancellation(error: unknown): boolean {
  return error instanceof Error && error.message === "STARTUP_CANCELLED";
}

export interface V2Application {
  server: ReturnType<typeof createServer>;
  shutdown(): Promise<void>;
}

export async function startV2(
  isStopping: () => boolean = () => false,
  env: NodeJS.ProcessEnv = process.env,
): Promise<V2Application> {
  const host = env.HOST ?? "127.0.0.1";
  const rawPort = env.PORT ?? "4317";
  if (host !== "127.0.0.1") throw new Error("INVALID_HOST");
  if (!/^\d+$/.test(rawPort)) throw new Error("INVALID_PORT");
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port > 65535) throw new Error("INVALID_PORT");
  const state = await prepareStateDirectory(resolveStateDirectory(env));
  const lease = await OwnedStoreLease.acquireOwned(state, () =>
    openSessionDatabase(path.join(state, "sessions.sqlite3")),
  );
  const store = new SessionRepository(lease.db);
  const v1Provider = new ConfirmedProcessProvider(new NodeProcessProvider());
  const service = new SessionService(new PiHarnessAdapter(v1Provider));
  let runtime: ReturnType<typeof createBuiltinDurableRuntime> | undefined;
  let server: ReturnType<typeof createApiServer> | undefined;
  const sockets = new Set<import("node:net").Socket>();
  let cancellationRequested = false;
  const checkCancellation = (): void => {
    if (!isStopping()) return;
    cancellationRequested = true;
    throw new Error("STARTUP_CANCELLED");
  };
  try {
    checkCancellation();
    runtime = createBuiltinDurableRuntime({ store, owner: lease.generation });
    reconcileStartup(store, runtime.registry);
    checkCancellation();
    server = createApiServer(service, host, runtime);
    server.on("connection", (socket) => {
      sockets.add(socket);
      socket.once("close", () => sockets.delete(socket));
    });
    await new Promise<void>((resolve, reject) => {
      server!.once("error", reject);
      server!.listen(port, host, () => {
        server!.removeListener("error", reject);
        resolve();
      });
    });
    checkCancellation();
    return {
      server,
      shutdown: createShutdown({ runtime, service, lease }, server, sockets),
    };
  } catch {
    const cancelled = cancellationRequested || isStopping();
    try {
      if (runtime && server) {
        await createShutdown({ runtime, service, lease }, server, sockets)();
      } else {
        const owners = await Promise.allSettled([
          ...(runtime ? [runtime.shutdown()] : []),
          service.shutdown(),
        ]);
        if (owners.some((owner) => owner.status === "rejected"))
          throw new Error("PROCESS_DRAIN_UNCONFIRMED");
        await lease.release();
      }
    } catch {
      throw new Error("STARTUP_ROLLBACK_UNCONFIRMED");
    }
    throw new Error(cancelled ? "STARTUP_CANCELLED" : "V2_STARTUP_FAILED");
  }
}
