import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openSessionDatabase } from "../src/persistence/sqlite-database.js";
import { SessionRepository } from "../src/persistence/session-repository.js";

describe("durable record read boundary", () => {
  it("fails closed on corrupted persisted identity and checkpoint envelope after reopen", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "durable-read-"));
    const file = path.join(dir, "db.sqlite");
    let db = openSessionDatabase(file);
    try {
      const repo = new SessionRepository(db);
      repo.create({
        id: "S1",
        harnessId: "third",
        cwd: "/work",
        status: "stopped",
        adapterState: { namespace: "third.audit", version: 1, data: {} },
        createdAt: "now",
      });
      db.exec("UPDATE sessions SET id='bad/id'");
      db.close();
      db = openSessionDatabase(file);
      expect(() => new SessionRepository(db).list()).toThrow(
        "CORRUPT_SESSION_RECORD",
      );
      db.exec("UPDATE sessions SET id='S1',harness_id='bad/id'");
      db.close();
      db = openSessionDatabase(file);
      expect(() => new SessionRepository(db).get("S1")).toThrow(
        "CORRUPT_SESSION_RECORD",
      );
      db.prepare("UPDATE sessions SET harness_id='third',adapter_state=?").run(
        '{"namespace":42,"version":1,"data":{}}',
      );
      db.close();
      db = openSessionDatabase(file);
      expect(() => new SessionRepository(db).get("S1")).toThrow(
        "CORRUPT_SESSION_RECORD",
      );
      db.prepare("UPDATE sessions SET adapter_state=?").run(
        `${" ".repeat(65537)}{"namespace":"third.audit","version":1,"data":{}}`,
      );
      db.close();
      db = openSessionDatabase(file);
      expect(() => new SessionRepository(db).get("S1")).toThrow(
        "CORRUPT_SESSION_RECORD",
      );
    } finally {
      db.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
