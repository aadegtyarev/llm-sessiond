import type { DurableSessionStore } from "../src/core/durable-session-manager.js";
import type {
  DurableSession,
  OwnerGeneration,
} from "../src/persistence/session-record.js";
export class MemoryStore implements DurableSessionStore {
  assertOwner(owner: OwnerGeneration) {
    if (owner.token !== "test-owner" || owner.generation !== 1)
      throw new Error("stale");
  }
  rows = new Map<string, DurableSession>();
  create(row: DurableSession) {
    this.rows.set(row.id, structuredClone(row));
  }
  get(id: string) {
    const row = this.rows.get(id);
    return row && structuredClone(row);
  }
  list() {
    return [...this.rows.values()];
  }
  rename(id: string, name: string | null) {
    const row = this.rows.get(id)!;
    if (name === null) delete row.name;
    else row.name = name;
  }
  setStatus(
    id: string,
    status: DurableSession["status"],
    reason: string | null = null,
    at: string | null = null,
  ) {
    const row = this.rows.get(id)!;
    row.status = status;
    if (reason) row.failureReason = reason;
    else delete row.failureReason;
    if (at) row.failedAt = at;
    else delete row.failedAt;
  }
  updateExecution(
    id: string,
    nativeId: string | undefined,
    checkpoint: DurableSession["adapterState"],
    owner: OwnerGeneration,
  ) {
    this.assertOwner(owner);
    const row = this.rows.get(id)!;
    if (nativeId) row.nativeSessionId = nativeId;
    if (checkpoint) row.adapterState = checkpoint;
  }
  delete(id: string) {
    this.rows.delete(id);
  }
}
