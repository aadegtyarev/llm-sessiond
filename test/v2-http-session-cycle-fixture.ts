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
import { createCycleAdapter } from "./v2-session-cycle-adapter.js";

export async function createSessionCycleFixture(inputEnabled = false) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "v2-session-cycle-"));
  const db = openSessionDatabase(path.join(dir, "state.sqlite"));
  const lease = await OwnedStoreLease.acquire(dir, db);
  const fake = createCycleAdapter(inputEnabled);
  let generatedIds = 0;
  const repository = new SessionRepository(db);
  const runtime = createDurableRuntime({
    store: repository,
    owner: lease.generation,
    defaultId: "test",
    id: () =>
      generatedIds++ === 0 ? "Session.Mixed-1" : `input-${generatedIds}`,
    bindings: [{ adapter: fake.adapter, factory: fake.factory }],
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
    repository,
    server,
    base,
    effects: fake.effects,
    inputEffects: fake.inputEffects,
    failLaunch: fake.failLaunch,
    failStop: fake.failStop,
    failInput: fake.failInput,
    async dispose() {
      await close(server);
      fake.failStop(false);
      await runtime.shutdown();
      await lease.release();
      db.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}
