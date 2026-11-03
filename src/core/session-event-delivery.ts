import type { ManagedSessionEventRecord } from "./managed-session-events.js";
import { cloneDomainEvent } from "./managed-session-events.js";

export class SessionEventDelivery {
  private readonly listeners = new Set<
    (record: ManagedSessionEventRecord) => void
  >();
  private readonly pending: Array<{
    record: ManagedSessionEventRecord;
    listeners: Array<(record: ManagedSessionEventRecord) => void>;
    valid: () => boolean;
  }> = [];
  private scheduled = false;
  subscribe(listener: (record: ManagedSessionEventRecord) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  publish(
    record: ManagedSessionEventRecord,
    valid: () => boolean = () => true,
  ): void {
    this.pending.push({ record, listeners: [...this.listeners], valid });
    if (this.scheduled) return;
    this.scheduled = true;
    setImmediate(() => this.deliver());
  }
  private deliver(): void {
    this.scheduled = false;
    while (this.pending.length) {
      const next = this.pending.shift()!;
      for (const listener of next.listeners) {
        if (!this.listeners.has(listener)) continue;
        let valid = false;
        try {
          valid = next.valid();
        } catch {
          break;
        }
        if (!valid) break;
        try {
          listener(
            Object.freeze({
              revision: next.record.revision,
              event: cloneDomainEvent(next.record.event),
            }),
          );
        } catch {
          this.listeners.delete(listener);
        }
      }
    }
  }
}
