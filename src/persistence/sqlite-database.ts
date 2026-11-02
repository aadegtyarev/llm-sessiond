import { DatabaseSync } from "node:sqlite";
import { SafeValidationError } from "../core/generic-json.js";
import { migrateDatabase } from "./sqlite-migrations.js";
import { OwnedDatabaseCleanupUnconfirmed } from "./owned-store.js";

export function openSessionDatabase(file: string): DatabaseSync {
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(file);
  } catch {
    throw new SafeValidationError("CORRUPT_DATABASE");
  }
  try {
    db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000");
    migrateDatabase(db);
    return db;
  } catch (error) {
    try {
      db.close();
    } catch {
      throw new OwnedDatabaseCleanupUnconfirmed();
    }
    if (error instanceof SafeValidationError) throw error;
    throw new SafeValidationError("CORRUPT_DATABASE");
  }
}
