import type { DatabaseSync } from "node:sqlite";
import { SafeValidationError } from "../core/generic-json.js";

type Column = {
  name: string;
  type: string;
  notnull: number;
  dflt_value: unknown;
  pk: number;
  hidden: number;
};
type SchemaObject = { type: string; name: string; tbl_name: string };
type Index = { name: string; unique: number; origin: string; partial: number };
type IndexedColumn = {
  seqno: number;
  cid: number;
  name: string | null;
  desc: number;
  coll: string;
  key: number;
};
const sessionColumns = [
  ["id", "TEXT", 1, 1],
  ["harness_id", "TEXT", 1, 0],
  ["cwd", "TEXT", 1, 0],
  ["status", "TEXT", 1, 0],
  ["name", "TEXT", 0, 0],
  ["native_session_id", "TEXT", 0, 0],
  ["adapter_options", "TEXT", 0, 0],
  ["adapter_state", "TEXT", 0, 0],
  ["failure_reason", "TEXT", 0, 0],
  ["failed_at", "TEXT", 0, 0],
  ["created_at", "TEXT", 1, 0],
] as const;
export function validateRevisionOneSchema(db: DatabaseSync): void {
  const objects = db
    .prepare(
      "SELECT type,name,tbl_name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all() as SchemaObject[];
  if (
    JSON.stringify(objects) !==
    JSON.stringify([
      { type: "table", name: "control_metadata", tbl_name: "control_metadata" },
      { type: "table", name: "sessions", tbl_name: "sessions" },
    ])
  )
    throw new SafeValidationError("CORRUPT_DATABASE_SCHEMA");
  validateTable(db, "sessions", sessionColumns);
  validateTable(db, "control_metadata", [
    ["key", "TEXT", 1, 1],
    ["value", "TEXT", 1, 0],
  ]);
}
function validateTable(
  db: DatabaseSync,
  name: string,
  expected: readonly (readonly [string, string, number, number])[],
): void {
  const columns = db.prepare(`PRAGMA table_xinfo(${name})`).all() as Column[];
  if (
    columns.length !== expected.length ||
    columns.some((column, i) => {
      const [columnName, type, notNull, primaryKey] = expected[i]!;
      return (
        column.name !== columnName ||
        column.type.toUpperCase() !== type ||
        column.notnull !== notNull ||
        column.dflt_value !== null ||
        column.pk !== primaryKey ||
        column.hidden !== 0
      );
    })
  )
    throw new SafeValidationError("CORRUPT_DATABASE_SCHEMA");
  const indexes = db.prepare(`PRAGMA index_list(${name})`).all() as Index[];
  const primary = expected.find((column) => column[3] === 1)?.[0];
  if (
    indexes.length !== 1 ||
    indexes[0]?.unique !== 1 ||
    indexes[0]?.origin !== "pk" ||
    indexes[0]?.partial !== 0 ||
    !primary
  )
    throw new SafeValidationError("CORRUPT_DATABASE_SCHEMA");
  const keys = db
    .prepare(`PRAGMA index_xinfo(${indexes[0].name})`)
    .all() as IndexedColumn[];
  const keyColumns = keys.filter((column) => column.key === 1);
  if (
    keyColumns.length !== 1 ||
    keyColumns[0]?.seqno !== 0 ||
    keyColumns[0]?.cid !== 0 ||
    keyColumns[0]?.name !== primary ||
    keyColumns[0]?.desc !== 0 ||
    keyColumns[0]?.coll !== "BINARY"
  )
    throw new SafeValidationError("CORRUPT_DATABASE_SCHEMA");
}
