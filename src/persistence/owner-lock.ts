import { mkdir, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { SafeValidationError } from "../core/generic-json.js";

type Owner = { pid: number; token: string };
export class OwnerLock {
  private constructor(readonly directory: string, readonly token: string) {}
  static async acquire(stateDir: string): Promise<OwnerLock> {
    const directory = path.join(stateDir, "owner.lock");
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await mkdir(directory);
        const token = randomUUID();
        await writeFile(path.join(directory, "owner.json"), JSON.stringify({ pid: process.pid, token }), { mode: 0o600, flag: "wx" });
        return new OwnerLock(directory, token);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (!await OwnerLock.removeDeadOwner(directory)) throw new SafeValidationError("OWNER_ALREADY_ACTIVE");
      }
    }
    throw new SafeValidationError("OWNER_ALREADY_ACTIVE");
  }
  private static async removeDeadOwner(directory: string): Promise<boolean> {
    try {
      const owner = JSON.parse(await readFile(path.join(directory, "owner.json"), "utf8")) as Owner;
      if (!Number.isInteger(owner.pid) || owner.pid < 1) return false;
      try { process.kill(owner.pid, 0); return false; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") return false; }
      await rm(path.join(directory, "owner.json"), { force: true });
      await rmdir(directory);
      return true;
    } catch { return false; }
  }
  async release(): Promise<void> {
    try {
      const owner = JSON.parse(await readFile(path.join(this.directory, "owner.json"), "utf8")) as Owner;
      if (owner.pid !== process.pid || owner.token !== this.token) return;
      await rm(path.join(this.directory, "owner.json"));
      await rmdir(this.directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}
