import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import {
  validateHarnessId,
  validateSessionId,
} from "../core/durable-validation.js";
import { SafeValidationError } from "../core/generic-json.js";
import { SessionReader } from "./session-reader.js";
import { CheckpointRepository } from "./checkpoint-repository.js";
import { encodeCheckpoint, encodeOptions } from "./encode-json.js";
import type { DurableSession, OwnerGeneration } from "./session-record.js";

export class SessionRepository {
  private readonly reader: SessionReader;
  private readonly checkpointWriter: CheckpointRepository;
  constructor(private readonly db: DatabaseSync) {
    this.reader = new SessionReader(db);
    this.checkpointWriter = new CheckpointRepository(db);
  }
  create(session: DurableSession): void {
    validateSessionId(session.id);
    validateHarnessId(session.harnessId);
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
    return this.reader.list();
  }
  get(id: string): DurableSession | undefined {
    return this.reader.get(id);
  }
  rename(id: string, name: string | null): void {
    validateSessionId(id);
    this.update("UPDATE sessions SET name=? WHERE id=?", name, id);
  }
  setStatus(
    id: string,
    status: DurableSession["status"],
    failureReason: string | null = null,
    failedAt: string | null = null,
  ): void {
    validateSessionId(id);
    this.update(
      "UPDATE sessions SET status=?,failure_reason=?,failed_at=? WHERE id=?",
      status,
      failureReason,
      failedAt,
      id,
    );
  }
  updateOptions(id: string, options: DurableSession["adapterOptions"]): void {
    validateSessionId(id);
    this.update(
      "UPDATE sessions SET adapter_options=? WHERE id=?",
      encodeOptions(options),
      id,
    );
  }
  delete(id: string): void {
    validateSessionId(id);
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
  updateCheckpoint(id: string, checkpoint: DurableSession["adapterState"], owner: OwnerGeneration): void {
    this.checkpointWriter.update(id, checkpoint, owner);
  }
}
