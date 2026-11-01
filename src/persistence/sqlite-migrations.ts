import type { DatabaseSync } from "node:sqlite";
import { SafeValidationError } from "../core/generic-json.js";

export function migrateDatabase(db: DatabaseSync): void {
  db.exec("PRAGMA journal_mode = WAL");
  const version = Number(db.prepare("PRAGMA user_version").get()?.user_version);
  if (!Number.isInteger(version) || version > 1)
    throw new SafeValidationError("UNSUPPORTED_DATABASE_SCHEMA");
  if (version === 1) {
    validateRevisionOne(db);
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
    db.exec(`CREATE TABLE sessions (
      id TEXT PRIMARY KEY, harness_id TEXT NOT NULL, cwd TEXT NOT NULL, status TEXT NOT NULL,
      name TEXT, native_session_id TEXT, adapter_options TEXT, adapter_state TEXT,
      failure_reason TEXT, failed_at TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE control_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    PRAGMA user_version = 1;`);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
function validateRevisionOne(db: DatabaseSync): void {
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND type IN ('table','index','view','trigger') ORDER BY name",
    )
    .all()
    .map((row) => String(row.name));
  if (tables.join(",") !== "control_metadata,sessions")
    throw new SafeValidationError("CORRUPT_DATABASE_SCHEMA");
  const expected = [
    "id",
    "harness_id",
    "cwd",
    "status",
    "name",
    "native_session_id",
    "adapter_options",
    "adapter_state",
    "failure_reason",
    "failed_at",
    "created_at",
  ];
  const actual = db
    .prepare("PRAGMA table_info(sessions)")
    .all()
    .map((row) => String(row.name));
  const metadata = db
    .prepare("PRAGMA table_info(control_metadata)")
    .all()
    .map((row) => String(row.name));
  if (
    actual.join(",") !== expected.join(",") ||
    metadata.join(",") !== "key,value"
  )
    throw new SafeValidationError("CORRUPT_DATABASE_SCHEMA");
}
