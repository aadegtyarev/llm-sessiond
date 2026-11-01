import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { SafeValidationError } from "../core/generic-json.js";
import { decodeSessionRow } from "./decode-session-row.js";
import { encodeCheckpoint, encodeOptions } from "./encode-json.js";
import type { DurableSession, OwnerGeneration } from "./session-record.js";

export class SessionRepository {
  constructor(private readonly db: DatabaseSync) {}
  create(session: DurableSession): void {
    this.db
      .prepare(`INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
      .run(
        session.id,
        session.harnessId,
        session.cwd,
        session.status,
        session.name ?? null,
        session.nativeSessionId ?? null,
        encodeOptions(session.adapterOptions),
        encodeCheckpoint(session.adapterState),
        session.failureReason ?? null,
        session.failedAt ?? null,
        session.createdAt,
      );
  }
  list(): DurableSession[] {
    return this.db
      .prepare("SELECT * FROM sessions ORDER BY created_at,id")
      .all()
      .map((row) => decodeSessionRow(row as Record<string, unknown>));
  }
  get(id: string): DurableSession | undefined {
    const row = this.db.prepare("SELECT * FROM sessions WHERE id=?").get(id);
    return row ? decodeSessionRow(row as Record<string, unknown>) : undefined;
  }
  rename(id: string, name: string | null): void {
    this.update("UPDATE sessions SET name=? WHERE id=?", name, id);
  }
  setStatus(
    id: string,
    status: DurableSession["status"],
    failureReason: string | null = null,
    failedAt: string | null = null,
  ): void {
    this.update(
      "UPDATE sessions SET status=?,failure_reason=?,failed_at=? WHERE id=?",
      status,
      failureReason,
      failedAt,
      id,
    );
  }
  updateOptions(id: string, options: DurableSession["adapterOptions"]): void {
    this.update(
      "UPDATE sessions SET adapter_options=? WHERE id=?",
      encodeOptions(options),
      id,
    );
  }
  delete(id: string): void {
    this.update("DELETE FROM sessions WHERE id=?", id);
  }
  private update(sql: string, ...values: unknown[]): void {
    if (
      Number(
        this.db.prepare(sql).run(...(values as SQLInputValue[])).changes,
      ) !== 1
    )
      throw new SafeValidationError("SESSION_NOT_FOUND");
  }
  updateCheckpoint(
    id: string,
    checkpoint: DurableSession["adapterState"],
    owner: OwnerGeneration,
  ): void {
    const encoded = encodeCheckpoint(checkpoint);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.db
        .prepare("SELECT value FROM control_metadata WHERE key='owner'")
        .get() as { value?: string } | undefined;
      if (current?.value !== JSON.stringify(owner))
        throw new SafeValidationError("STALE_OWNER_GENERATION");
      this.update(
        "UPDATE sessions SET adapter_state=? WHERE id=?",
        encoded,
        id,
      );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
