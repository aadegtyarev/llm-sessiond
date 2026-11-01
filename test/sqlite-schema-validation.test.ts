import { mkdtemp, rm } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openSessionDatabase } from "../src/persistence/sqlite-database.js";
import { REVISION_1_TABLES } from "../src/persistence/sqlite-schema-definitions.js";

const goodSessions = REVISION_1_TABLES.find(
  (table) => table.name === "sessions",
)!.sql;
const goodMetadata = REVISION_1_TABLES.find(
  (table) => table.name === "control_metadata",
)!.sql;
async function rejectedSchema(
  sessions: string,
  metadata = goodMetadata,
  version = 1,
): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "sessiond-schema-invalid-"));
  const file = path.join(dir, "db.sqlite");
  try {
    const db = new DatabaseSync(file);
    db.exec(`${sessions}; ${metadata}; PRAGMA user_version=${version}`);
    db.close();
    expect(() => openSessionDatabase(file)).toThrow(
      version < 0 ? "UNSUPPORTED_DATABASE_SCHEMA" : "CORRUPT_DATABASE_SCHEMA",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
describe("revision-one schema integrity", () => {
  it("accepts the migration-owned revision-one DDL on reopen", async () => {
    const dir = await mkdtemp(
      path.join(os.tmpdir(), "sessiond-schema-canonical-"),
    );
    const file = path.join(dir, "db.sqlite");
    try {
      const created = openSessionDatabase(file);
      created.close();
      const reopened = openSessionDatabase(file);
      reopened.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("rejects negative versions, wrong types/nullability, and missing primary keys", async () => {
    await rejectedSchema(goodSessions, goodMetadata, -1);
    await rejectedSchema(goodSessions.replace("id TEXT", "id INTEGER"));
    await rejectedSchema(
      goodSessions.replace("harness_id TEXT NOT NULL", "harness_id TEXT"),
    );
    await rejectedSchema(
      goodSessions.replace("id TEXT PRIMARY KEY NOT NULL", "id TEXT NOT NULL"),
    );
    await rejectedSchema(
      goodSessions.replace(
        "id TEXT PRIMARY KEY NOT NULL",
        "id TEXT COLLATE NOCASE PRIMARY KEY NOT NULL",
      ),
    );
    await rejectedSchema(
      goodSessions.replace(
        "id TEXT PRIMARY KEY NOT NULL",
        "id TEXT PRIMARY KEY ON CONFLICT REPLACE NOT NULL",
      ),
    );
    const noCaseColumn = goodSessions
      .replace(
        "id TEXT PRIMARY KEY NOT NULL",
        "id TEXT COLLATE NOCASE NOT NULL",
      )
      .replace(
        "created_at TEXT NOT NULL)",
        "created_at TEXT NOT NULL, PRIMARY KEY(id COLLATE BINARY))",
      );
    await rejectedSchema(noCaseColumn);
    await rejectedSchema(
      goodSessions.replace(
        "status TEXT NOT NULL",
        "status TEXT NOT NULL CHECK(status='stopped')",
      ),
    );
    await rejectedSchema(
      goodSessions,
      "CREATE TABLE control_metadata(key TEXT,value TEXT NOT NULL)",
    );
  });
  it("rejects view substitution even when its output columns match", async () => {
    await rejectedSchema(
      "CREATE VIEW sessions AS SELECT 'x' AS id,'h' AS harness_id,'/' AS cwd,'stopped' AS status,NULL AS name,NULL AS native_session_id,NULL AS adapter_options,NULL AS adapter_state,NULL AS failure_reason,NULL AS failed_at,'now' AS created_at",
    );
  });
});
