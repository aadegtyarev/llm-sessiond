import type { DurableSessionStore } from "./session-manager-store.js";
import type {
  DurableSession,
  OwnerGeneration,
} from "../persistence/session-record.js";
import type { ManagedSessionEvent } from "./managed-session-events.js";
import { captureSession } from "./managed-session-view.js";

export class DurableSessionCommitObserver {
  private readonly pending: Array<{
    id: string;
    deleted: boolean;
    snapshot?: DurableSession;
  }> = [];
  private draining = false;
  constructor(
    private readonly store: DurableSessionStore,
    private readonly owner: OwnerGeneration,
    private readonly publish: (event: ManagedSessionEvent) => void,
  ) {}
  get hasPending(): boolean {
    return this.pending.length > 0;
  }
  commit(id: string, deleted: boolean, snapshot?: DurableSession): void {
    this.pending.push({ id, deleted, ...(snapshot ? { snapshot } : {}) });
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.pending.length) {
        const next = this.pending.shift()!;
        this.capture(next.id, next.deleted, next.snapshot);
      }
    } catch {
      this.pending.length = 0;
      throw new Error("SESSION_EVENT_CAPTURE_FAILED");
    } finally {
      this.draining = false;
    }
  }
  private capture(id: string, deleted: boolean, row?: DurableSession): void {
    this.store.assertOwner(this.owner);
    if (deleted)
      return this.publish({ kind: "session.deleted", sessionId: id });
    if (!row || row.id !== id) throw new Error("COMMITTED_SESSION_MISSING");
    const session = captureSession(row);
    this.store.assertOwner(this.owner);
    this.publish({ kind: "session.changed", session });
  }
}
