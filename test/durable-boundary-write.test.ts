import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openSessionDatabase } from "../src/persistence/sqlite-database.js";
import { SessionRepository } from "../src/persistence/session-repository.js";

describe("durable record write boundary", () => {
  it("rejects invalid session and harness identities", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "durable-write-id-"));
    const db = openSessionDatabase(path.join(dir, "db.sqlite"));
    const repo = new SessionRepository(db);
    const record = {
      id: "valid",
      harnessId: "third",
      cwd: "/work",
      status: "stopped" as const,
      createdAt: "now",
    };
    try {
      for (const id of ["", "bad/id", "x".repeat(129)])
        expect(() => repo.create({ ...record, id })).toThrow();
      expect(() => repo.create({ ...record, harnessId: "bad/id" })).toThrow();
      expect(() => repo.get("bad/id")).toThrow("INVALID_SESSION_ID");
      expect(() => repo.rename("bad/id", "bad")).toThrow("INVALID_SESSION_ID");
      expect(() => repo.updateOptions("bad/id", {})).toThrow(
        "INVALID_SESSION_ID",
      );
    } finally {
      db.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("strictly validates checkpoint envelopes but preserves unknown adapters and versions", async () => {
    const dir = await mkdtemp(
      path.join(os.tmpdir(), "durable-write-checkpoint-"),
    );
    const file = path.join(dir, "db.sqlite");
    let db = openSessionDatabase(file);
    const repo = new SessionRepository(db);
    const base = {
      id: "S1",
      harnessId: "unknown-adapter",
      cwd: "/work",
      status: "stopped" as const,
      createdAt: "now",
    };
    try {
      for (const adapterState of [
        { namespace: "third.audit", version: 1, data: {}, extra: true },
        { namespace: 42, version: 1, data: {} },
        { namespace: "third.audit", version: 0, data: {} },
        { namespace: "bad/namespace", version: 1, data: {} },
      ])
        expect(() =>
          repo.create({
            ...base,
            id: "bad-checkpoint",
            adapterState: adapterState as never,
          }),
        ).toThrow();
      repo.create({
        ...base,
        adapterState: {
          namespace: "third.audit",
          version: 999,
          data: { opaque: true },
        },
      });
      db.close();
      db = openSessionDatabase(file);
      expect(new SessionRepository(db).get("S1")?.adapterState).toEqual({
        namespace: "third.audit",
        version: 999,
        data: { opaque: true },
      });
    } finally {
      db.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
