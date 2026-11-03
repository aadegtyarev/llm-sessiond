import type { LifecycleExecution } from "./lifecycle-execution.js";
import type { DurableSessionEvents } from "./durable-session-events.js";
import { deferUnsubscribe } from "./deferred-unsubscribe.js";
interface Source {
  execution: LifecycleExecution;
  unsubscribe?: () => void;
  active: boolean;
}
export class ExecutionEventSources {
  private readonly sources = new Map<string, Source>();
  constructor(
    private readonly events: DurableSessionEvents,
    private readonly isCurrent: (
      sessionId: string,
      execution: LifecycleExecution,
    ) => boolean,
  ) {}
  track(sessionId: string, execution: LifecycleExecution): void {
    this.close(sessionId);
    const source: Source = { execution, active: true };
    this.sources.set(sessionId, source);
    if (!this.isCurrent(sessionId, execution))
      return this.closeSource(sessionId, source);
    let port;
    try {
      port = execution.events;
    } catch {
      return this.closeSource(sessionId, source);
    }
    if (!this.isCurrent(sessionId, execution))
      return this.closeSource(sessionId, source);
    if (!port) return this.closeSource(sessionId, source);
    try {
      const unsubscribe = port.subscribe((value) =>
        this.forward(sessionId, source, value),
      );
      if (typeof unsubscribe !== "function")
        throw new Error("INVALID_SUBSCRIPTION");
      source.unsubscribe = unsubscribe;
      if (!this.isCurrent(sessionId, execution))
        return this.closeSource(sessionId, source);
      if (!source.active) {
        delete source.unsubscribe;
        deferUnsubscribe(unsubscribe);
      }
    } catch {
      this.closeSource(sessionId, source);
    }
  }
  markStopping(sessionId: string, execution: LifecycleExecution): void {
    const source = this.sources.get(sessionId);
    if (source?.execution === execution) this.closeSource(sessionId, source);
  }
  close(sessionId: string): void {
    const source = this.sources.get(sessionId);
    if (source) this.closeSource(sessionId, source);
  }
  private forward(sessionId: string, source: Source, value: unknown): void {
    try {
      if (!source.active || this.sources.get(sessionId) !== source) return;
      if (!value || typeof value !== "object") return;
      const record = value as Record<string, unknown>;
      const kind = record.kind;
      const text = record.text;
      if (kind !== "output" || typeof text !== "string") return;
      const event = {
        kind: "harness.event" as const,
        sessionId,
        event: { kind: "output" as const, text },
      };
      const current = this.isCurrent(sessionId, source.execution);
      if (!current) return this.closeSource(sessionId, source);
      if (!source.active || this.sources.get(sessionId) !== source) return;
      this.events.publish(event, () => {
        const currentAfterDelivery = this.isCurrent(
          sessionId,
          source.execution,
        );
        if (!currentAfterDelivery) this.closeSource(sessionId, source);
        return (
          currentAfterDelivery &&
          source.active &&
          this.sources.get(sessionId) === source
        );
      });
    } catch {
      this.closeSource(sessionId, source);
    }
  }
  private closeSource(sessionId: string, source: Source): void {
    source.active = false;
    if (this.sources.get(sessionId) === source) this.sources.delete(sessionId);
    const unsubscribe = source.unsubscribe;
    delete source.unsubscribe;
    if (unsubscribe) deferUnsubscribe(unsubscribe);
  }
}
