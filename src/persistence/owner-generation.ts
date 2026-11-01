import type { DatabaseSync } from "node:sqlite";
import type { OwnerGeneration } from "./session-record.js";

export function claimOwnerGeneration(db: DatabaseSync, token: string): OwnerGeneration {
  db.exec("BEGIN IMMEDIATE");
  try {
    const raw = db.prepare("SELECT value FROM control_metadata WHERE key='owner' ").get() as { value: string } | undefined;
    const previous = raw ? JSON.parse(raw.value) as OwnerGeneration : undefined;
    const generation = (previous?.generation ?? 0) + 1;
    const owner = { token, generation };
    db.prepare("INSERT INTO control_metadata(key,value) VALUES('owner',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(owner));
    db.exec("COMMIT");
    return owner;
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
export function revokeOwnerGeneration(db: DatabaseSync, owner: OwnerGeneration): void {
  db.prepare("DELETE FROM control_metadata WHERE key='owner' AND value=?").run(JSON.stringify(owner));
}
