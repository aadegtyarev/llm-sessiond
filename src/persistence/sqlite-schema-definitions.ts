export interface SqliteTableDefinition {
  readonly name: string;
  readonly sql: string;
}
export const REVISION_1_TABLES: readonly SqliteTableDefinition[] =
  Object.freeze([
    Object.freeze({
      name: "sessions",
      sql: `CREATE TABLE sessions (
      id TEXT PRIMARY KEY NOT NULL, harness_id TEXT NOT NULL, cwd TEXT NOT NULL, status TEXT NOT NULL,
      name TEXT, native_session_id TEXT, adapter_options TEXT, adapter_state TEXT,
      failure_reason TEXT, failed_at TEXT, created_at TEXT NOT NULL
    )`,
    }),
    Object.freeze({
      name: "control_metadata",
      sql: "CREATE TABLE control_metadata (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)",
    }),
  ]);
