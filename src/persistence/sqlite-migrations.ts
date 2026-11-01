import type { DatabaseSync } from "node:sqlite";
import { SafeValidationError } from "../core/generic-json.js";
import { validateRevisionOneSchema } from "./sqlite-schema-validator.js";
import { REVISION_1_TABLES } from "./sqlite-schema-definitions.js";

export function migrateDatabase(db: DatabaseSync): void {
  db.exec("PRAGMA journal_mode = WAL");
  const version = Number(db.prepare("PRAGMA user_version").get()?.user_version);
  if (!Number.isInteger(version) || version < 0 || version > 1)
    throw new SafeValidationError("UNSUPPORTED_DATABASE_SCHEMA");
  if (version === 1) {
    validateRevisionOneSchema(db);
    return;
  }
  const hasObjects = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND type IN ('table','index','view','trigger')",
    )
    .all();
  if (hasObjects.length)
    throw new SafeValidationError("CORRUPT_DATABASE_SCHEMA");
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const table of REVISION_1_TABLES) db.exec(table.sql);
    db.exec("PRAGMA user_version = 1");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
