import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApiServer } from "../src/api/server.js";
import { SessionService } from "../src/core/session-service.js";
import type { HarnessAdapter } from "../src/core/adapter-contracts.js";
import { createDurableRuntime } from "../src/harness/durable-runtime.js";
import { OwnedStoreLease } from "../src/persistence/owned-store.js";
import { openSessionDatabase } from "../src/persistence/sqlite-database.js";
import { SessionRepository } from "../src/persistence/session-repository.js";
import { close, listen } from "./v2-http-discovery-support.js";

export async function createDiscoveryFixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "v2-discovery-case-"));
  const db = openSessionDatabase(path.join(dir, "state.sqlite"));
  const lease = await OwnedStoreLease.acquire(dir, db);
  const adapter: HarnessAdapter = {
    descriptor: {
      id: "third-party",
      aliases: ["third"],
      capabilities: ["harness.launch"],
      options: [
        {
          key: "mode",
          label: "Mode",
          values: [{ nested: ["safe"] }],
          defaultValue: { selected: ["one"] },
          dangerousValues: [{ selected: "no" }],
        },
      ],
      extensions: [
        {
          namespace: "vendor.ext",
          version: 1,
          operations: [
            { name: "inspect", effect: "read", guardRequired: false },
          ],
          events: ["changed"],
        },
      ],
    },
    validateCheckpoint: () => true,
    isResumable: () => false,
  };
  const other: HarnessAdapter = {
    descriptor: { id: "other", aliases: [], capabilities: [] },
    validateCheckpoint: () => true,
    isResumable: () => false,
  };
  const runtime = createDurableRuntime({
    store: new SessionRepository(db),
    owner: lease.generation,
    defaultId: "third",
    bindings: [adapter, other].map((item) => ({
      adapter: item,
      factory: {
        create: () => {
          throw Error("fixture factory unused");
        },
      },
    })),
  });
  const server = createApiServer(
    new SessionService({} as never),
    "127.0.0.1",
    runtime,
  );
  const base = await listen(server);
  return {
    adapter,
    other,
    runtime,
    server,
    base,
    async dispose() {
      await close(server);
      await runtime.shutdown();
      await lease.release();
      db.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}
