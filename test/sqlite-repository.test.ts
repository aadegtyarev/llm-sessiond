import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openSessionDatabase } from "../src/persistence/sqlite-database.js";
import { SessionRepository } from "../src/persistence/session-repository.js";

describe("revision-one SQLite repository", () => {
  it("round-trips a checkpoint at the full-envelope 64 KiB boundary", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "sessiond-checkpoint-limit-"),
    );
    const file = path.join(directory, "sessions.sqlite");
    let db = openSessionDatabase(file);
    try {
      const empty = { namespace: "third.audit", version: 1, data: "" };
      const overhead = Buffer.byteLength(JSON.stringify(empty));
      const checkpoint = { ...empty, data: "x".repeat(65536 - overhead) };
      expect(Buffer.byteLength(JSON.stringify(checkpoint))).toBe(65536);
      new SessionRepository(db).create({
        id: "S-boundary",
        harnessId: "third",
        cwd: "/work",
        status: "stopped",
        adapterState: checkpoint,
        createdAt: "now",
      });
      db.close();
      db = openSessionDatabase(file);
      expect(new SessionRepository(db).get("S-boundary")?.adapterState).toEqual(
        checkpoint,
      );
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
