import type { DatabaseSync } from "node:sqlite";
import { SafeValidationError } from "../core/generic-json.js";
import { REVISION_1_TABLES } from "./sqlite-schema-definitions.js";

type SchemaTable = {
  type: string;
  name: string;
  tbl_name: string;
  sql: string | null;
};
function canonicalSql(sql: string): string {
  return sql
    .replace(/^[\t\n\v\f\r ]+|[\t\n\v\f\r ]+$/g, "")
    .replace(/;[\t\n\v\f\r ]*$/g, "")
    .replace(/[\t\n\v\f\r ]+/g, " ");
}
export function validateRevisionOneDdl(db: DatabaseSync): void {
  const tables = db
    .prepare(
      "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all() as SchemaTable[];
  if (tables.length !== REVISION_1_TABLES.length)
    throw new SafeValidationError("CORRUPT_DATABASE_SCHEMA");
  for (const table of tables) {
    const expected = REVISION_1_TABLES.find((item) => item.name === table.name);
    if (
      !expected ||
      table.type !== "table" ||
      table.tbl_name !== expected.name ||
      typeof table.sql !== "string" ||
      canonicalSql(table.sql) !== canonicalSql(expected.sql)
    )
      throw new SafeValidationError("CORRUPT_DATABASE_SCHEMA");
  }
}
