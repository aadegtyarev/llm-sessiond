import type { DurableSessionStore } from "./session-manager-store.js";
import type { OwnerGeneration } from "../persistence/session-record.js";
import type { ManagedSessionSnapshot } from "./managed-session-events.js";
import { captureSession } from "./managed-session-view.js";

export function captureDurableSessionSnapshot(
  store: DurableSessionStore,
  owner: OwnerGeneration,
  revision: () => number,
  pendingCommits: () => boolean,
): ManagedSessionSnapshot {
  const before = revision();
  try {
    store.assertOwner(owner);
    const sessions = store.list().map(captureSession);
    store.assertOwner(owner);
    if (before !== revision() || pendingCommits())
      throw new Error("SNAPSHOT_BOUNDARY_CHANGED");
    return { afterRevision: before, sessions };
  } catch (error) {
    if (error instanceof Error && error.message === "SNAPSHOT_BOUNDARY_CHANGED")
      throw error;
    throw new Error("SNAPSHOT_UNAVAILABLE");
  }
}
