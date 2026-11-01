import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openSessionDatabase } from "../src/persistence/sqlite-database.js";
import { SessionRepository } from "../src/persistence/session-repository.js";

describe("revision-one SQLite repository", () => {
  it("rejects duplicate opaque IDs without replacing the durable record", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "sessiond-duplicate-id-"),
    );
    const db = openSessionDatabase(path.join(directory, "db.sqlite"));
    const repository = new SessionRepository(db);
    try {
      repository.create({
        id: "same-id",
        harnessId: "third",
        cwd: "/first",
        status: "stopped",
        createdAt: "first",
      });
      expect(() =>
        repository.create({
          id: "same-id",
          harnessId: "third",
          cwd: "/replacement",
          status: "running",
          createdAt: "second",
        }),
      ).toThrow();
      expect(repository.get("same-id")).toMatchObject({
        cwd: "/first",
        createdAt: "first",
        status: "stopped",
      });
    } finally {
      db.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("round-trips opaque IDs, options, and checkpoints across reopen in WAL mode", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "sessiond-store-"));
    try {
      const file = path.join(directory, "sessions.sqlite");
      let db = openSessionDatabase(file);
      expect(db.prepare("PRAGMA journal_mode").get()).toMatchObject({
        journal_mode: "wal",
      });
      const repository = new SessionRepository(db);
      repository.create({
        id: "Opaque.Id-01",
        harnessId: "third-harness",
        cwd: "/work",
        status: "running",
        adapterOptions: { layout: "wide" },
        adapterState: {
          namespace: "third-harness.audit",
          version: 3,
          data: { cursor: 12 },
        },
        createdAt: "2026-01-01T00:00:00Z",
      });
      repository.rename("Opaque.Id-01", "renamed");
      repository.setStatus("Opaque.Id-01", "stopped");
      db.close();
      db = openSessionDatabase(file);
      expect(new SessionRepository(db).get("Opaque.Id-01")).toMatchObject({
        id: "Opaque.Id-01",
        name: "renamed",
        status: "stopped",
        adapterState: { version: 3, data: { cursor: 12 } },
      });
      expect(new SessionRepository(db).list()).toHaveLength(1);
      db.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
