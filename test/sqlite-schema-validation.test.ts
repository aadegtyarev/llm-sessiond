import { mkdtemp, rm } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openSessionDatabase } from "../src/persistence/sqlite-database.js";

const goodSessions =
  "CREATE TABLE sessions(id TEXT PRIMARY KEY NOT NULL,harness_id TEXT NOT NULL,cwd TEXT NOT NULL,status TEXT NOT NULL,name TEXT,native_session_id TEXT,adapter_options TEXT,adapter_state TEXT,failure_reason TEXT,failed_at TEXT,created_at TEXT NOT NULL)";
const goodMetadata =
  "CREATE TABLE control_metadata(key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL)";
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
    expect(() => openSessionDatabase(file)).toThrow();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
describe("revision-one schema integrity", () => {
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
