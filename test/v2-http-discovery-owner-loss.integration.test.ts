import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createApiServer } from "../src/api/server.js";
import { SessionService } from "../src/core/session-service.js";
import type { HarnessAdapter } from "../src/core/adapter-contracts.js";
import { createDurableRuntime } from "../src/harness/durable-runtime.js";
import { OwnedStoreLease } from "../src/persistence/owned-store.js";
import { openSessionDatabase } from "../src/persistence/sqlite-database.js";
import { SessionRepository } from "../src/persistence/session-repository.js";
import { close, listen } from "./v2-http-discovery-support.js";

describe("v2 discovery owner loss", () => {
  it("returns safe unavailable after the prepared store loses its lease", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "v2-owner-loss-"));
    const db = openSessionDatabase(path.join(dir, "state.sqlite"));
    const lease = await OwnedStoreLease.acquire(dir, db);
    const adapter: HarnessAdapter = {
      descriptor: { id: "external", aliases: [], capabilities: [] },
      validateCheckpoint: () => true,
      isResumable: () => false,
    };
    const runtime = createDurableRuntime({
      store: new SessionRepository(db),
      owner: lease.generation,
      defaultId: "external",
      bindings: [
        {
          adapter,
          factory: {
            create: () => {
              throw Error("unused");
            },
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
    try {
      await lease.release();
      const response = await fetch(`${base}/api/v2/health`);
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain(lease.generation.token);
    } finally {
      await close(server);
      await runtime.shutdown().catch(() => undefined);
      db.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
