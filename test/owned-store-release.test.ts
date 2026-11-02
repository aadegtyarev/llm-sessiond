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
  lockDirectory?: string,
  failClose = false,
): DatabaseSync {
  return {
    exec: (sql: string) => events.push(sql),
    prepare: (sql: string) => ({
      get: () => undefined,
      run: () => events.push(sql),
    }),
    close: () => {
      events.push(
        lockDirectory && existsSync(lockDirectory) ? "close-locked" : "close",
      );
      if (failClose) throw Error("close");
    },
  } as unknown as DatabaseSync;
}

describe("owned store release", () => {
  it("retains the lock when owned database close is unconfirmed", async () => {
    const dir = await mkdtemp(
      path.join(os.tmpdir(), "owned-store-close-fail-"),
    );
    try {
      const lease = await OwnedStoreLease.acquireOwned(dir, () =>
        fakeDatabase([], path.join(dir, "owner.lock"), true),
      );
      await expect(lease.release()).rejects.toThrow("close");
      await expect(OwnerLock.acquire(dir)).rejects.toThrow(
        "OWNER_ALREADY_ACTIVE",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("revokes and closes before unlock, idempotently", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "owned-store-close-"));
    const events: string[] = [];
    try {
      const lease = await OwnedStoreLease.acquireOwned(dir, () =>
        fakeDatabase(events, path.join(dir, "owner.lock")),
      );
      const close = lease.release();
      expect(lease.release()).toBe(close);
      await Promise.all([close, lease.release()]);
      expect(
        events.findIndex((event) => event.startsWith("DELETE")),
      ).toBeLessThan(events.indexOf("close-locked"));
      const prepared = await OwnedStoreLease.acquire(dir, fakeDatabase(events));
      await prepared.release();
      expect(events).not.toContain("close");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
