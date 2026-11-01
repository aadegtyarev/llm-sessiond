import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openSessionDatabase } from "../src/persistence/sqlite-database.js";
import { REVISION_1_TABLES } from "../src/persistence/sqlite-schema-definitions.js";
import { expectSchemaRejected } from "./sqlite-schema-reopen-fixture.js";

const goodSessions = REVISION_1_TABLES.find(
  (table) => table.name === "sessions",
)!.sql;
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
    await expectSchemaRejected(goodSessions, undefined, -1);
    await expectSchemaRejected(goodSessions.replace("id TEXT", "id INTEGER"));
    await expectSchemaRejected(
      goodSessions.replace("harness_id TEXT NOT NULL", "harness_id TEXT"),
    );
    await expectSchemaRejected(
      goodSessions.replace("id TEXT PRIMARY KEY NOT NULL", "id TEXT NOT NULL"),
    );
    await expectSchemaRejected(
      goodSessions.replace(
        "id TEXT PRIMARY KEY NOT NULL",
        "id TEXT COLLATE NOCASE PRIMARY KEY NOT NULL",
      ),
    );
    await expectSchemaRejected(
      goodSessions.replace(
        "id TEXT PRIMARY KEY NOT NULL",
        "id TEXT PRIMARY KEY ON CONFLICT REPLACE NOT NULL",
      ),
    );
    const noCaseColumn = goodSessions.replace(
      /\bid\s+TEXT\s+PRIMARY\s+KEY\s+NOT\s+NULL/,
      "id TEXT COLLATE NOCASE NOT NULL",
    );
    const closingParen = noCaseColumn.lastIndexOf(")");
    const noCaseBinaryPrimaryKey = `${noCaseColumn.slice(0, closingParen)}, PRIMARY KEY(id COLLATE BINARY)${noCaseColumn.slice(closingParen)}`;
    await expectSchemaRejected(noCaseBinaryPrimaryKey, undefined, 1, (db) => {
      const sql = db
        .prepare("SELECT sql FROM sqlite_schema WHERE name='sessions'")
        .get() as { sql: string };
      expect(sql.sql).toContain("id TEXT COLLATE NOCASE NOT NULL");
      expect(sql.sql).toContain("PRIMARY KEY(id COLLATE BINARY)");
      const columns = db.prepare("PRAGMA table_info(sessions)").all() as Array<{
        name: string;
        pk: number;
      }>;
      expect(columns.find((column) => column.name === "id")?.pk).toBe(1);
      const indexes = db.prepare("PRAGMA index_list(sessions)").all() as Array<{
        name: string;
        origin: string;
        unique: number;
      }>;
      const primary = indexes.find((index) => index.origin === "pk");
      expect(primary?.unique).toBe(1);
      const key = db
        .prepare(`PRAGMA index_xinfo(${primary?.name})`)
        .all() as Array<{ key: number; name: string | null; coll: string }>;
      expect(key.find((column) => column.key === 1)).toMatchObject({
        name: "id",
        coll: "BINARY",
      });
    });
    await expectSchemaRejected(
      goodSessions.replace(
        "status TEXT NOT NULL",
        "status TEXT NOT NULL CHECK(status='stopped')",
      ),
    );
    await expectSchemaRejected(
      goodSessions,
      "CREATE TABLE control_metadata(key TEXT,value TEXT NOT NULL)",
    );
  });
  it("rejects view substitution even when its output columns match", async () => {
    await expectSchemaRejected(
      "CREATE VIEW sessions AS SELECT 'x' AS id,'h' AS harness_id,'/' AS cwd,'stopped' AS status,NULL AS name,NULL AS native_session_id,NULL AS adapter_options,NULL AS adapter_state,NULL AS failure_reason,NULL AS failed_at,'now' AS created_at",
    );
  });
});
