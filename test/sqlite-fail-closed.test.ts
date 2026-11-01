import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openSessionDatabase } from "../src/persistence/sqlite-database.js";
import { SessionRepository } from "../src/persistence/session-repository.js";

describe("SQLite fail-closed validation", () => {
  it("rejects an unknown newer schema", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "sessiond-newer-"));
    const file = path.join(dir, "db.sqlite");
    try {
      openSessionDatabase(file).close();
      const db = openSessionDatabase(file);
      db.exec("PRAGMA user_version=2");
      db.close();
      expect(() => openSessionDatabase(file)).toThrow(
        "UNSUPPORTED_DATABASE_SCHEMA",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("rejects a revision-one database with unexpected schema objects", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "sessiond-schema-"));
    const file = path.join(dir, "db.sqlite");
    try {
      const db = openSessionDatabase(file);
      db.exec("ALTER TABLE sessions RENAME TO unexpected_sessions");
      db.close();
      expect(() => openSessionDatabase(file)).toThrow(
        "CORRUPT_DATABASE_SCHEMA",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("rejects corrupt persisted JSON rather than decoding partially", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "sessiond-corrupt-"));
    const file = path.join(dir, "db.sqlite");
    try {
      const db = openSessionDatabase(file);
      const repo = new SessionRepository(db);
      repo.create({
        id: "opaque",
        harnessId: "third",
        cwd: "/work",
        status: "stopped",
        adapterOptions: { layout: "wide" },
        createdAt: "now",
      });
      db.exec("UPDATE sessions SET adapter_options='{' WHERE id='opaque'");
      expect(() => repo.get("opaque")).toThrow("CORRUPT_SESSION_RECORD");
      db.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
