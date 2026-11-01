import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { OwnerLock } from "../src/persistence/owner-lock.js";

describe("cross-process owner lock", () => {
  it("rejects a concurrent owner and releases only its own lock", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "sessiond-lock-"));
    try {
      const owner = await OwnerLock.acquire(dir);
      await expect(OwnerLock.acquire(dir)).rejects.toThrow(
        "OWNER_ALREADY_ACTIVE",
      );
      const file = path.join(dir, "owner.lock", "owner.json");
      const original = await readFile(file, "utf8");
      await writeFile(
        file,
        JSON.stringify({ pid: process.pid, token: "other-owner" }),
      );
      await owner.release();
      await expect(OwnerLock.acquire(dir)).rejects.toThrow(
        "OWNER_ALREADY_ACTIVE",
      );
      await writeFile(file, original);
      await owner.release();
      const next = await OwnerLock.acquire(dir);
      await next.release();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("removes a provably stale PID lock but preserves malformed ownership", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "sessiond-stale-"));
    try {
      const lockDir = path.join(dir, "owner.lock");
      await mkdir(lockDir);
      await writeFile(
        path.join(lockDir, "owner.json"),
        JSON.stringify({ pid: 99999999, token: "dead" }),
      );
      const owner = await OwnerLock.acquire(dir);
      await owner.release();
      await mkdir(lockDir);
      await writeFile(path.join(lockDir, "owner.json"), "{}");
      await expect(OwnerLock.acquire(dir)).rejects.toThrow(
        "OWNER_ALREADY_ACTIVE",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
