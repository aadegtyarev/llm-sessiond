import type { DatabaseSync } from "node:sqlite";
import { validateSessionId } from "../core/durable-validation.js";
import { SafeValidationError } from "../core/generic-json.js";
import { encodeCheckpoint } from "./encode-json.js";
import type { AdapterCheckpoint } from "../core/adapter-contracts.js";
import type { OwnerGeneration } from "./session-record.js";

export class CheckpointRepository {
  constructor(private readonly db: DatabaseSync) {}
  update(
    id: string,
    checkpoint: AdapterCheckpoint | undefined,
    owner: OwnerGeneration,
  ): void {
    validateSessionId(id);
    const encoded = encodeCheckpoint(checkpoint);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.db
        .prepare("SELECT value FROM control_metadata WHERE key='owner'")
        .get() as { value?: string } | undefined;
      if (current?.value !== JSON.stringify(owner))
        throw new SafeValidationError("STALE_OWNER_GENERATION");
      const result = this.db
        .prepare("UPDATE sessions SET adapter_state=? WHERE id=?")
        .run(encoded, id);
      if (Number(result.changes) !== 1)
        throw new SafeValidationError("SESSION_NOT_FOUND");
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
