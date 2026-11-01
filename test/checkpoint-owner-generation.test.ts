import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openSessionDatabase } from "../src/persistence/sqlite-database.js";
import { OwnedStoreLease } from "../src/persistence/owned-store.js";
import { SessionRepository } from "../src/persistence/session-repository.js";
import { CheckpointRepository } from "../src/persistence/checkpoint-repository.js";

describe("checkpoint owner generation", () => {
  it("rejects writes from released and superseded generations", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "sessiond-generation-"));
    const db = openSessionDatabase(path.join(dir, "db.sqlite"));
    try {
      const repository = new SessionRepository(db);
      const checkpoints = new CheckpointRepository(db);
      repository.create({
        id: "s1",
        harnessId: "third",
        cwd: "/work",
        status: "stopped",
        nativeSessionId: "before-native",
        adapterState: {
          namespace: "third.audit",
          version: 1,
          data: { before: true },
        },
        createdAt: "now",
      });
      const first = await OwnedStoreLease.acquire(dir, db);
      const oldGeneration = first.generation;
      await first.release();
      const second = await OwnedStoreLease.acquire(dir, db);
      expect(() =>
        checkpoints.update(
          "s1",
          { namespace: "third.audit", version: 1, data: {} },
          oldGeneration,
        ),
      ).toThrow("STALE_OWNER_GENERATION");
      expect(() =>
        repository.updateExecution(
          "s1",
          "stale-native",
          { namespace: "third.audit", version: 1, data: {} },
          oldGeneration,
        ),
      ).toThrow("STALE_OWNER_GENERATION");
      expect(repository.get("s1")?.nativeSessionId).toBe("before-native");
      expect(repository.get("s1")?.adapterState?.data).toEqual({
        before: true,
      });
      repository.updateExecution(
        "s1",
        "native",
        { namespace: "third.audit", version: 1, data: { updated: true } },
        second.generation,
      );
      expect(repository.get("s1")?.nativeSessionId).toBe("native");
      expect(repository.get("s1")?.adapterState?.data).toEqual({
        updated: true,
      });
      expect(() =>
        repository.updateExecution(
          "missing",
          "native",
          undefined,
          second.generation,
        ),
      ).toThrow("SESSION_NOT_FOUND");
      repository.updateExecution(
        "s1",
        undefined,
        { namespace: "third.audit", version: 1, data: { keep: true } },
        second.generation,
      );
      expect(repository.get("s1")?.nativeSessionId).toBeUndefined();
      expect(repository.get("s1")?.adapterState?.data).toEqual({ keep: true });
      repository.updateExecution(
        "s1",
        "keep-native",
        undefined,
        second.generation,
      );
      expect(repository.get("s1")?.nativeSessionId).toBe("keep-native");
      expect(repository.get("s1")?.adapterState).toBeUndefined();
      repository.updateExecution("s1", undefined, undefined, second.generation);
      expect(repository.get("s1")?.nativeSessionId).toBeUndefined();
      expect(repository.get("s1")?.adapterState).toBeUndefined();
      await second.release();
    } finally {
      db.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
