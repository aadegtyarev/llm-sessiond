import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApiServer } from "../src/api/server.js";
import { SessionService } from "../src/core/session-service.js";
import { createDurableRuntime } from "../src/harness/durable-runtime.js";
import { OwnedStoreLease } from "../src/persistence/owned-store.js";
import { openSessionDatabase } from "../src/persistence/sqlite-database.js";
import { SessionRepository } from "../src/persistence/session-repository.js";
import { close, listen } from "./v2-http-discovery-support.js";

export async function createSessionCycleFixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "v2-session-cycle-"));
  const db = openSessionDatabase(path.join(dir, "state.sqlite"));
  const lease = await OwnedStoreLease.acquire(dir, db);
  let launches = 0;
  let stops = 0;
  let failLaunch = false;
  let failStop = false;
  const adapter = {
    descriptor: {
      id: "test",
      aliases: [],
      capabilities: ["harness.launch", "harness.stop"],
    },
    validateCheckpoint: () => true,
    isResumable: () => false,
  };
  const runtime = createDurableRuntime({
    store: new SessionRepository(db),
    owner: lease.generation,
    defaultId: "test",
    id: () => "Session.Mixed-1",
    bindings: [
      {
        adapter,
        factory: {
          create: () => ({
            launch: async () => {
              launches++;
              if (failLaunch) throw new Error("PRIVATE LAUNCH DETAIL");
              return { nativeSessionId: "native-safe" };
            },
            resume: async () => ({}),
            stop: async () => {
              stops++;
              if (failStop) throw new Error("PRIVATE STOP DETAIL");
            },
          }),
        },
      },
    ],
  });
  const server = createApiServer(
    new SessionService({} as never),
    "127.0.0.1",
    runtime,
  );
  const base = await listen(server);
  return {
    dir,
    db,
    runtime,
    server,
    base,
    effects: () => ({ launches, stops }),
    failLaunch: (value: boolean) => {
      failLaunch = value;
    },
    failStop: (value: boolean) => {
      failStop = value;
    },
    async dispose() {
      await close(server);
      failStop = false;
      await runtime.shutdown();
      await lease.release();
      db.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}
