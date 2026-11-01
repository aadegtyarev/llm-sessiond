import { ControlPlaneError } from "./control-plane-error.js";
import { SafeValidationError } from "./generic-json.js";
import type { DurableSessionStore } from "./session-manager-store.js";
import type {
  DurableSession,
  OwnerGeneration,
} from "../persistence/session-record.js";
export class SafeSessionStore implements DurableSessionStore {
  constructor(private readonly inner: DurableSessionStore) {}
  assertOwner(owner: OwnerGeneration): void {
    this.call(() => this.inner.assertOwner(owner));
  }
  create(row: DurableSession): void {
    this.call(() => this.inner.create(row));
  }
  get(id: string): DurableSession | undefined {
    return this.call(() => this.inner.get(id));
  }
  list(): DurableSession[] {
    return this.call(() => this.inner.list());
  }
  rename(id: string, name: string | null): void {
    this.call(() => this.inner.rename(id, name));
  }
  setStatus(
    id: string,
    status: DurableSession["status"],
    reason?: string | null,
    at?: string | null,
  ): void {
    this.call(() => this.inner.setStatus(id, status, reason, at));
  }
  updateExecution(
    id: string,
    nativeId: string | undefined,
    checkpoint: DurableSession["adapterState"],
    owner: OwnerGeneration,
  ): void {
    this.call(() =>
      this.inner.updateExecution(id, nativeId, checkpoint, owner),
    );
  }
  delete(id: string): void {
    this.call(() => this.inner.delete(id));
  }
  private call<T>(operation: () => T): T {
    try {
      return operation();
    } catch (error) {
      if (error instanceof ControlPlaneError) throw error;
      if (
        error instanceof SafeValidationError &&
        error.code === "STALE_OWNER_GENERATION"
      )
        throw new ControlPlaneError("STALE_OWNER");
      if (
        error instanceof SafeValidationError &&
        error.code === "SESSION_NOT_FOUND"
      )
        throw new ControlPlaneError("NOT_FOUND");
      throw new ControlPlaneError("STORE_FAILED");
    }
  }
}
