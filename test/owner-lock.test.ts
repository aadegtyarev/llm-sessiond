import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { OwnerLock } from "../src/persistence/owner-lock.js";

describe("cross-process owner lock", () => {
  it("allows exactly one simultaneous acquisition", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "sessiond-lock-race-"));
    try {
      const results = await Promise.allSettled([
        OwnerLock.acquire(dir),
        OwnerLock.acquire(dir),
      ]);
      const owners = results.filter((result) => result.status === "fulfilled");
      expect(owners).toHaveLength(1);
      await (owners[0] as PromiseFulfilledResult<OwnerLock>).value.release();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("shares release and cannot remove a subsequently acquired owner", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "sessiond-lock-release-"));
    try {
      const owner = await OwnerLock.acquire(dir);
      const first = owner.release();
      const second = owner.release();
      expect(first).toBe(second);
      await Promise.all([first, second]);
      const next = await OwnerLock.acquire(dir);
      await owner.release();
      await expect(OwnerLock.acquire(dir)).rejects.toThrow(
        "OWNER_ALREADY_ACTIVE",
      );
      await next.release();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("preserves malformed, missing-token, and changed-token locks", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "sessiond-lock-unknown-"));
    try {
      const lockDir = path.join(dir, "owner.lock");
      await mkdir(lockDir);
      await writeFile(path.join(lockDir, "owner.json"), "{}");
      await expect(OwnerLock.acquire(dir)).rejects.toThrow(
        "OWNER_ALREADY_ACTIVE",
      );
      expect(await readFile(path.join(lockDir, "owner.json"), "utf8")).toBe(
        "{}",
      );
      await rm(lockDir, { recursive: true });
      await mkdir(lockDir);
      await expect(OwnerLock.acquire(dir)).rejects.toThrow(
        "OWNER_ALREADY_ACTIVE",
      );
      await expect(
        readFile(path.join(lockDir, "owner.json"), "utf8"),
      ).rejects.toThrow();
      await writeFile(
        path.join(lockDir, "owner.json"),
        JSON.stringify({ pid: 99999999, token: "dead" }),
      );
      const deadOwner = await readFile(
        path.join(lockDir, "owner.json"),
        "utf8",
      );
      await expect(OwnerLock.acquire(dir)).rejects.toThrow(
        "OWNER_ALREADY_ACTIVE",
      );
      expect(await readFile(path.join(lockDir, "owner.json"), "utf8")).toBe(
        deadOwner,
      );
      await rm(lockDir, { recursive: true });
      const owner = await OwnerLock.acquire(dir);
      await writeFile(
        path.join(lockDir, "owner.json"),
        JSON.stringify({ pid: process.pid, token: "different" }),
      );
      await owner.release();
      expect(
        await readFile(path.join(lockDir, "owner.json"), "utf8"),
      ).toContain("different");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
