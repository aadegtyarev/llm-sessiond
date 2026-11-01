import type { DatabaseSync } from "node:sqlite";
import { OwnerLock } from "./owner-lock.js";
import { claimOwnerGeneration, revokeOwnerGeneration } from "./owner-generation.js";
import type { OwnerGeneration } from "./session-record.js";

export class OwnedStoreLease {
  private constructor(private readonly lock: OwnerLock, private readonly db: DatabaseSync, readonly generation: OwnerGeneration) {}
  static async acquire(stateDir: string, db: DatabaseSync): Promise<OwnedStoreLease> {
    const lock = await OwnerLock.acquire(stateDir);
    try { return new OwnedStoreLease(lock, db, claimOwnerGeneration(db, lock.token)); }
    catch (error) { await lock.release(); throw error; }
  }
  async release(): Promise<void> {
    revokeOwnerGeneration(this.db, this.generation);
    await this.lock.release();
  }
}
