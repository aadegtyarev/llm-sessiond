import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { OwnedStoreLease } from "../src/persistence/owned-store.js";
import { OwnerLock } from "../src/persistence/owner-lock.js";
import { openSessionDatabase } from "../src/persistence/sqlite-database.js";

type FailureCase = "pragma" | "newer" | "malformed";
async function prepareFailure(
  file: string,
  failure: FailureCase,
): Promise<void> {
  if (failure === "pragma") return;
  const db = openSessionDatabase(file);
  if (failure === "newer") db.exec("PRAGMA user_version=2");
  else db.exec("ALTER TABLE sessions RENAME TO broken_sessions");
  db.close();
}

describe("database opener cleanup ownership", () => {
  it.each([
    ["pragma", false],
    ["pragma", true],
    ["newer", false],
    ["newer", true],
    ["malformed", false],
    ["malformed", true],
  ])("%s migration failure; close confirmed=%s", async (kind, confirmed) => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "opener-cleanup-"));
    const file = path.join(dir, "state.sqlite");
    await prepareFailure(file, kind as FailureCase);
    const originalExec = DatabaseSync.prototype.exec;
    const originalClose = DatabaseSync.prototype.close;
    const handles: DatabaseSync[] = [];
    DatabaseSync.prototype.exec = function (sql) {
      if (kind === "pragma" && sql.startsWith("PRAGMA foreign_keys"))
        throw Error("injected init failure");
      return originalExec.call(this, sql);
    };
    DatabaseSync.prototype.close = function () {
      handles.push(this);
      if (confirmed) return originalClose.call(this);
      throw Error("injected close failure");
    };
    try {
      const opening = OwnedStoreLease.acquireOwned(dir, () =>
        openSessionDatabase(file),
      );
      if (confirmed) await expect(opening).rejects.toThrow();
      else
        await expect(opening).rejects.toThrow(
          "OWNED_DATABASE_CLEANUP_UNCONFIRMED",
        );
      expect(handles).toHaveLength(1);
      expect(handles[0]?.isOpen).toBe(!confirmed);
      if (confirmed) {
        const next = await OwnerLock.acquire(dir);
        await next.release();
      } else {
        await expect(OwnerLock.acquire(dir)).rejects.toThrow(
          "OWNER_ALREADY_ACTIVE",
        );
      }
    } finally {
      DatabaseSync.prototype.exec = originalExec;
      DatabaseSync.prototype.close = originalClose;
      for (const handle of handles)
        if (handle.isOpen) originalClose.call(handle);
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("unlocks when database construction fails before a handle exists", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "opener-no-handle-"));
    try {
      await expect(
        OwnedStoreLease.acquireOwned(dir, () =>
          openSessionDatabase(path.join(dir, "missing", "state.sqlite")),
        ),
      ).rejects.toThrow();
      const next = await OwnerLock.acquire(dir);
      await next.release();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
