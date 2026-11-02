import type { DatabaseSync } from "node:sqlite";
import { OwnerLock } from "./owner-lock.js";
import {
  claimOwnerGeneration,
  revokeOwnerGeneration,
} from "./owner-generation.js";
import type { OwnerGeneration } from "./session-record.js";

export class OwnedStoreLease {
  private closePromise: Promise<void> | undefined;
  private constructor(
    private readonly lock: OwnerLock,
    readonly db: DatabaseSync,
    readonly generation: OwnerGeneration,
    private readonly ownsDatabase: boolean,
  ) {}
  static async acquire(
    stateDir: string,
    db: DatabaseSync,
  ): Promise<OwnedStoreLease> {
    return this.acquireAfterLock(stateDir, async () => db, false);
  }
  static async acquireOwned(
    stateDir: string,
    openDatabase: () => DatabaseSync | Promise<DatabaseSync>,
  ): Promise<OwnedStoreLease> {
    return this.acquireAfterLock(stateDir, openDatabase, true);
  }
  private static async acquireAfterLock(
    stateDir: string,
    openDatabase: () => DatabaseSync | Promise<DatabaseSync>,
    ownsDatabase: boolean,
  ): Promise<OwnedStoreLease> {
    const lock = await OwnerLock.acquire(stateDir);
    let db: DatabaseSync | undefined;
    try {
      db = await openDatabase();
      const generation = claimOwnerGeneration(db, lock.token);
      return new OwnedStoreLease(lock, db, generation, ownsDatabase);
    } catch (error) {
      if (db && ownsDatabase) db.close();
      await lock.release();
      throw error;
    }
  }
  release(): Promise<void> {
    this.closePromise ??= this.closeOwnedStore();
    return this.closePromise;
  }
  private async closeOwnedStore(): Promise<void> {
    revokeOwnerGeneration(this.db, this.generation);
    if (this.ownsDatabase) this.db.close();
    await this.lock.release();
  }
}
