import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openSessionDatabase } from "../src/persistence/sqlite-database.js";
import { OwnedStoreLease } from "../src/persistence/owned-store.js";
import { SessionRepository } from "../src/persistence/session-repository.js";

describe("checkpoint owner generation", () => {
  it("rejects writes from released and superseded generations", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "sessiond-generation-"));
    const db = openSessionDatabase(path.join(dir, "db.sqlite"));
    try {
      const repository = new SessionRepository(db);
      repository.create({ id: "s1", harnessId: "third", cwd: "/work", status: "stopped", createdAt: "now" });
      const first = await OwnedStoreLease.acquire(dir, db);
      const oldGeneration = first.generation;
      await first.release();
      const second = await OwnedStoreLease.acquire(dir, db);
      expect(() => repository.updateCheckpoint("s1", { namespace: "third.audit", version: 1, data: {} }, oldGeneration)).toThrow("STALE_OWNER_GENERATION");
      repository.updateCheckpoint("s1", { namespace: "third.audit", version: 1, data: {} }, second.generation);
      await second.release();
    } finally { db.close(); await rm(dir, { recursive: true, force: true }); }
  });
});
