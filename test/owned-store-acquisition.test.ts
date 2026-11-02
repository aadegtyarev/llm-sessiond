import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { OwnedStoreLease } from "../src/persistence/owned-store.js";
import { OwnerLock } from "../src/persistence/owner-lock.js";

function fakeDatabase(
  events: string[],
  failClaim = false,
  lockDirectory?: string,
  failClose = false,
): DatabaseSync {
  return {
    exec: (sql: string) => events.push(sql),
    prepare: (sql: string) => ({
      get: () => undefined,
      run: () => {
        events.push(sql);
        if (failClaim && sql.startsWith("INSERT")) throw Error("claim");
      },
    }),
    close: () => {
      events.push(
        lockDirectory && existsSync(lockDirectory) ? "close-locked" : "close",
      );
      if (failClose) throw Error("close");
    },
  } as unknown as DatabaseSync;
}

describe("owned store acquisition", () => {
  it("does not open a database for a lock contender", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "owned-store-contender-"));
    const lock = await OwnerLock.acquire(dir);
    let opened = false;
    try {
      await expect(
        OwnedStoreLease.acquireOwned(dir, () => {
          opened = true;
          return fakeDatabase([]);
        }),
      ).rejects.toThrow("OWNER_ALREADY_ACTIVE");
      expect(opened).toBe(false);
    } finally {
      await lock.release();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("retains lock if failed initialization cannot close its database", async () => {
    const dir = await mkdtemp(
      path.join(os.tmpdir(), "owned-store-rollback-fail-"),
    );
    try {
      await expect(
        OwnedStoreLease.acquireOwned(dir, () =>
          fakeDatabase([], true, path.join(dir, "owner.lock"), true),
        ),
      ).rejects.toThrow("close");
      await expect(OwnerLock.acquire(dir)).rejects.toThrow(
        "OWNER_ALREADY_ACTIVE",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("releases after opener failure and closes before unlock after claim failure", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "owned-store-failure-"));
    const events: string[] = [];
    try {
      await expect(
        OwnedStoreLease.acquireOwned(dir, () => {
          throw Error("open");
        }),
      ).rejects.toThrow("open");
      const failing = fakeDatabase(events, true, path.join(dir, "owner.lock"));
      await expect(
        OwnedStoreLease.acquireOwned(dir, () => failing),
      ).rejects.toThrow("claim");
      expect(events).toContain("close-locked");
      const unlocked = await OwnerLock.acquire(dir);
      await unlocked.release();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
