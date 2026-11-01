import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HarnessRegistry } from "../src/core/adapter-registry.js";
import { DurableSessionManager } from "../src/core/durable-session-manager.js";
import { openSessionDatabase } from "../src/persistence/sqlite-database.js";
import { OwnedStoreLease } from "../src/persistence/owned-store.js";
import { SessionRepository } from "../src/persistence/session-repository.js";
import { synthetic } from "./durable-manager-support.js";
describe("durable manager SQLite persistence", () => {
  it("reopens launch status and adapter identity from the store", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "manager-reopen-"));
    const db = openSessionDatabase(path.join(dir, "state.sqlite"));
    const lease = await OwnedStoreLease.acquire(dir, db);
    try {
      const repository = new SessionRepository(db);
      const manager = new DurableSessionManager(
        repository,
        new HarnessRegistry([synthetic], "third"),
        {
          create: () => ({
            launch: async () => ({
              nativeSessionId: "native",
              checkpoint: {
                namespace: "synthetic.audit",
                version: 3,
                data: { key: "v" },
              },
            }),
            resume: async () => ({}),
            stop: async () => {},
          }),
        },
        lease.generation,
        () => "sqlite-session",
      );
      const created = await manager.create({ cwd: process.cwd() });
      expect(created.status).toBe("running");
      await lease.release();
      db.close();
      const reopened = openSessionDatabase(path.join(dir, "state.sqlite"));
      try {
        const row = new SessionRepository(reopened).get("sqlite-session");
        expect(row?.status).toBe("running");
        expect(row?.nativeSessionId).toBe("native");
        expect(row?.adapterState?.data).toEqual({ key: "v" });
      } finally {
        reopened.close();
      }
    } finally {
      if (db.isOpen) db.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
