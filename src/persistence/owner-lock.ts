import { mkdir, readFile, rmdir, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { SafeValidationError } from "../core/generic-json.js";

type Owner = { pid: number; token: string };
export class OwnerLock {
  private releasePromise: Promise<void> | undefined;
  private constructor(
    readonly directory: string,
    readonly token: string,
  ) {}
  // Unknown or dead owners are never reclaimed; a hard crash may require manual cleanup.
  static async acquire(stateDir: string): Promise<OwnerLock> {
    const directory = path.join(stateDir, "owner.lock");
    try {
      await mkdir(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST")
        throw new SafeValidationError("OWNER_ALREADY_ACTIVE");
      throw error;
    }
    const token = randomUUID();
    try {
      await writeFile(
        path.join(directory, "owner.json"),
        JSON.stringify({ pid: process.pid, token }),
        { mode: 0o600, flag: "wx" },
      );
      return new OwnerLock(directory, token);
    } catch (error) {
      await rmdir(directory).catch(() => undefined);
      throw error;
    }
  }
  release(): Promise<void> {
    this.releasePromise ??= this.releaseOwnedLock();
    return this.releasePromise;
  }
  private async releaseOwnedLock(): Promise<void> {
    const file = path.join(this.directory, "owner.json");
    let owner: Partial<Owner>;
    try {
      owner = JSON.parse(await readFile(file, "utf8")) as Partial<Owner>;
    } catch {
      throw new SafeValidationError("OWNER_LOCK_CHANGED");
    }
    if (owner === null || typeof owner !== "object" || Array.isArray(owner))
      throw new SafeValidationError("OWNER_LOCK_CHANGED");
    const keys = Object.keys(owner).sort().join(",");
    if (
      owner.pid !== process.pid ||
      owner.token !== this.token ||
      keys !== "pid,token"
    )
      throw new SafeValidationError("OWNER_LOCK_CHANGED");
    await unlink(file);
    await rmdir(this.directory);
  }
}
