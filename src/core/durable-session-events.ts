import type { DurableSessionStore } from "./session-manager-store.js";
import type {
  DurableSession,
  OwnerGeneration,
} from "../persistence/session-record.js";
import type {
  ManagedSessionEvent,
  ManagedSessionSnapshot,
} from "./managed-session-events.js";
import { cloneDomainEvent } from "./managed-session-events.js";
import { DurableSessionCommitObserver } from "./durable-session-commit-observer.js";
import { captureDurableSessionSnapshot } from "./durable-session-snapshot.js";
import { SessionEventDelivery } from "./session-event-delivery.js";

export class DurableSessionEvents {
  private revision = 0;
  private readonly delivery = new SessionEventDelivery();
  private readonly commits: DurableSessionCommitObserver;
  private failed = false;
  constructor(
    private readonly store: DurableSessionStore,
    private readonly owner: OwnerGeneration,
  ) {
    this.commits = new DurableSessionCommitObserver(store, owner, (event) =>
      this.publish(event, () => this.ownerIsCurrent()),
    );
  }
  commitSession(id: string, deleted = false, snapshot?: DurableSession): void {
    if (this.failed) throw new Error("SESSION_EVENT_FEED_UNAVAILABLE");
    try {
      this.commits.commit(id, deleted, snapshot);
    } catch {
      this.failed = true;
      throw new Error("SESSION_EVENT_FEED_UNAVAILABLE");
    }
  }
  publishInput(
    event: import("./input-runtime-events.js").ManagedInputEvent,
  ): void {
    this.publish(
      {
        kind: "harness.event",
        sessionId: event.sessionId,
        event: {
          kind: "input",
          inputEvent: {
            inputId: event.inputId,
            state: event.state,
            ...(event.reason ? { failure: { reason: event.reason } } : {}),
          },
        },
      },
      () => this.ownerIsCurrent(),
    );
  }
  subscribe = this.delivery.subscribe.bind(this.delivery);
  publish(event: ManagedSessionEvent, valid?: () => boolean): void {
    if (this.failed) throw new Error("SESSION_EVENT_FEED_UNAVAILABLE");
    if (!Number.isSafeInteger(this.revision + 1))
      throw new Error("EVENT_REVISION_EXHAUSTED");
    const captured = cloneDomainEvent(event);
    this.delivery.publish(
      Object.freeze({
        revision: ++this.revision,
        event: captured,
      }),
      valid,
    );
  }
  private ownerIsCurrent(): boolean {
    try {
      this.store.assertOwner(this.owner);
      return true;
    } catch {
      return false;
    }
  }
  snapshot(): ManagedSessionSnapshot {
    if (this.failed) throw new Error("SNAPSHOT_UNAVAILABLE");
    return captureDurableSessionSnapshot(
      this.store,
      this.owner,
      () => this.revision,
      () => this.commits.hasPending,
    );
  }
}
