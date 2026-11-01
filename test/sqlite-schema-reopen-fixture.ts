import { mkdtemp, rm } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";
import { expect } from "vitest";
import { openSessionDatabase } from "../src/persistence/sqlite-database.js";
import { REVISION_1_TABLES } from "../src/persistence/sqlite-schema-definitions.js";

export async function expectSchemaRejected(
  sessions: string,
  metadata = REVISION_1_TABLES.find(
    (table) => table.name === "control_metadata",
  )!.sql,
  version = 1,
  inspect?: (db: DatabaseSync) => void,
): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "sessiond-schema-invalid-"));
  const file = path.join(dir, "db.sqlite");
  try {
    const db = new DatabaseSync(file);
    db.exec(`${sessions}; ${metadata}; PRAGMA user_version=${version}`);
    inspect?.(db);
    db.close();
    expect(() => openSessionDatabase(file)).toThrow(
      version < 0 ? "UNSUPPORTED_DATABASE_SCHEMA" : "CORRUPT_DATABASE_SCHEMA",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
