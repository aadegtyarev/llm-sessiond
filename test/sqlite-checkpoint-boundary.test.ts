import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openSessionDatabase } from "../src/persistence/sqlite-database.js";
import { SessionRepository } from "../src/persistence/session-repository.js";

describe("SQLite full checkpoint envelope boundary", () => {
  it("round-trips an envelope at exactly 64 KiB across reopen", async () => {
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
});
