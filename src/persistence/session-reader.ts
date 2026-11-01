import type { DatabaseSync } from "node:sqlite";
import { validateSessionId } from "../core/durable-validation.js";
import { decodeSessionRow } from "./decode-session-row.js";
import type { DurableSession } from "./session-record.js";

export class SessionReader {
  constructor(private readonly db: DatabaseSync) {}
  list(): DurableSession[] {
    return this.db
      .prepare("SELECT * FROM sessions ORDER BY created_at,id")
      .all()
      .map((row) => decodeSessionRow(row as Record<string, unknown>));
  }
  get(id: string): DurableSession | undefined {
    validateSessionId(id);
    const row = this.db.prepare("SELECT * FROM sessions WHERE id=?").get(id);
    return row ? decodeSessionRow(row as Record<string, unknown>) : undefined;
  }
}
