import type { ManagedSessionEventRecord } from "./managed-session-events.js";
import { cloneDomainEvent } from "./managed-session-events.js";

type Observer = {
  listener: (record: ManagedSessionEventRecord) => void;
  onUnavailable?: () => void;
  active: boolean;
  unavailableNotified: boolean;
};

export class SessionEventDelivery {
  private readonly listeners = new Set<Observer>();
  private failed = false;
  private readonly pending: Array<{
    record: ManagedSessionEventRecord;
    listeners: Observer[];
    valid: () => boolean;
  }> = [];
  private scheduled = false;
  subscribe(
    listener: (record: ManagedSessionEventRecord) => void,
    onUnavailable?: () => void,
  ): () => void {
    const observer: Observer = {
      listener,
      ...(onUnavailable ? { onUnavailable } : {}),
      active: true,
      unavailableNotified: false,
    };
    if (this.failed) this.notifyUnavailable(observer);
    else this.listeners.add(observer);
    return () => {
      observer.active = false;
      this.listeners.delete(observer);
    };
  }
  fail(): void {
    if (this.failed) return;
    this.failed = true;
    this.pending.length = 0;
    for (const observer of this.listeners) this.notifyUnavailable(observer);
    this.listeners.clear();
  }
  private notifyUnavailable(observer: Observer): void {
    if (!observer.onUnavailable) return;
    setImmediate(() => {
      if (!observer.active || observer.unavailableNotified) return;
      observer.unavailableNotified = true;
      try {
        observer.onUnavailable?.();
      } catch {
        observer.active = false;
      }
      this.listeners.delete(observer);
    });
  }
  publish(
    record: ManagedSessionEventRecord,
    valid: () => boolean = () => true,
  ): void {
    if (this.failed) return;
    this.pending.push({ record, listeners: [...this.listeners], valid });
    if (this.scheduled) return;
    this.scheduled = true;
    setImmediate(() => this.deliver());
  }
  private deliver(): void {
    this.scheduled = false;
    while (!this.failed && this.pending.length) {
      const next = this.pending.shift()!;
      for (const observer of next.listeners) {
        if (this.failed) break;
        if (!observer.active || !this.listeners.has(observer)) continue;
        let valid = false;
        try {
          valid = next.valid();
        } catch {
          break;
        }
        if (!valid) break;
        try {
          observer.listener(
            Object.freeze({
              revision: next.record.revision,
              event: cloneDomainEvent(next.record.event),
            }),
          );
        } catch {
          observer.active = false;
          this.listeners.delete(observer);
        }
      }
    }
  }
}
