import type { DatabaseSync } from "node:sqlite";
import type { OwnerGeneration } from "./session-record.js";
import { SafeValidationError } from "../core/generic-json.js";

export function claimOwnerGeneration(
  db: DatabaseSync,
  token: string,
): OwnerGeneration {
  db.exec("BEGIN IMMEDIATE");
  try {
    const raw = db
      .prepare("SELECT value FROM control_metadata WHERE key='owner' ")
      .get() as { value: string } | undefined;
    let previous: OwnerGeneration | undefined;
    try {
      previous = raw ? (JSON.parse(raw.value) as OwnerGeneration) : undefined;
    } catch {
      throw new SafeValidationError("CORRUPT_OWNER_GENERATION");
    }
    if (
      previous &&
      (!Number.isSafeInteger(previous.generation) ||
        previous.generation < 1 ||
        typeof previous.token !== "string")
    )
      throw new SafeValidationError("CORRUPT_OWNER_GENERATION");
    const generation = (previous?.generation ?? 0) + 1;
    if (!Number.isSafeInteger(generation))
      throw new SafeValidationError("OWNER_GENERATION_EXHAUSTED");
    const owner = { token, generation };
    db.prepare(
      "INSERT INTO control_metadata(key,value) VALUES('owner',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    ).run(JSON.stringify(owner));
    db.exec("COMMIT");
    return owner;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
export function revokeOwnerGeneration(
  db: DatabaseSync,
  owner: OwnerGeneration,
): void {
  db.prepare("DELETE FROM control_metadata WHERE key='owner' AND value=?").run(
    JSON.stringify(owner),
  );
}
