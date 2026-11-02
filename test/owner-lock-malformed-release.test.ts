import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { OwnerLock } from "../src/persistence/owner-lock.js";

describe("malformed owner lock release", () => {
  it.each(["{}", "[]", "null", "true", "42", '"text"', "invalid"])(
    "fails safely and preserves metadata %s",
    async (metadata) => {
      const dir = await mkdtemp(
        path.join(os.tmpdir(), "owner-malformed-release-"),
      );
      try {
        const lock = await OwnerLock.acquire(dir);
        const file = path.join(lock.directory, "owner.json");
        await writeFile(file, metadata);
        await expect(lock.release()).rejects.toThrow("OWNER_LOCK_CHANGED");
        expect(await readFile(file, "utf8")).toBe(metadata);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
});
