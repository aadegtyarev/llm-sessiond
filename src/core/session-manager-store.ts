import type { DurableSession } from "../persistence/session-record.js";
import type { OwnerGeneration } from "../persistence/session-record.js";
export interface DurableSessionStore {
  assertOwner(owner: OwnerGeneration): void;
  create(session: DurableSession): void;
  get(id: string): DurableSession | undefined;
  list(): DurableSession[];
  rename(id: string, name: string | null, snapshot?: DurableSession): void;
  setStatus(
    id: string,
    status: DurableSession["status"],
    reason?: string | null,
    at?: string | null,
    snapshot?: DurableSession,
  ): void;
  updateExecution(
    id: string,
    nativeId: string | undefined,
    checkpoint: DurableSession["adapterState"],
    owner: OwnerGeneration,
    snapshot?: DurableSession,
  ): void;
  delete(id: string): void;
}
