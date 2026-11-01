import type { DatabaseSync } from "node:sqlite";
import { SafeValidationError } from "../core/generic-json.js";

type Index = { name: string; unique: number; origin: string; partial: number };
type IndexedColumn = {
  seqno: number;
  cid: number;
  name: string | null;
  desc: number;
  coll: string;
  key: number;
};
export function validatePrimaryIndex(
  db: DatabaseSync,
  table: string,
  primary: string,
): void {
  const indexes = db.prepare(`PRAGMA index_list(${table})`).all() as Index[];
  if (
    indexes.length !== 1 ||
    indexes[0]?.unique !== 1 ||
    indexes[0]?.origin !== "pk" ||
    indexes[0]?.partial !== 0
  )
    throw new SafeValidationError("CORRUPT_DATABASE_SCHEMA");
  const columns = db
    .prepare(`PRAGMA index_xinfo(${indexes[0].name})`)
    .all() as IndexedColumn[];
  const keys = columns.filter((column) => column.key === 1);
  if (
    keys.length !== 1 ||
    keys[0]?.seqno !== 0 ||
    keys[0]?.cid !== 0 ||
    keys[0]?.name !== primary ||
    keys[0]?.desc !== 0 ||
    keys[0]?.coll !== "BINARY"
  )
    throw new SafeValidationError("CORRUPT_DATABASE_SCHEMA");
}
