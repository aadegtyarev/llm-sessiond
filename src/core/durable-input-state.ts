import type { LifecycleExecution } from "./lifecycle-execution.js";
import type {
  InputCommandOutcome,
  InputFailureReason,
} from "./execution-input-port.js";
import { subscribeInputEvents } from "./input-event-settlement.js";
import {
  InputEventObservers,
  type ManagedInputEvent,
} from "./input-runtime-events.js";
export type RecordState = "pending" | "accepted" | "uncertain" | "canceling";
export interface InputOperation {
  id: string;
  sessionId: string;
  execution: LifecycleExecution;
  state: RecordState;
  unsubscribe: (() => void) | undefined;
}
export class DurableInputState {
  private readonly active = new Map<string, InputOperation>();
  private readonly ids = new Set<string>();
  private readonly events = new InputEventObservers();
  subscribe(listener: (event: ManagedInputEvent) => void): () => void {
    return this.events.subscribe(listener);
  }
  reserve(id: string): boolean {
    if (this.ids.has(id)) return false;
    this.ids.add(id);
    return true;
  }
  current(sessionId: string): InputOperation | undefined {
    return this.active.get(sessionId);
  }
  isCurrent(operation: InputOperation): boolean {
    return this.active.get(operation.sessionId) === operation;
  }
  register(operation: InputOperation): void {
    this.active.set(operation.sessionId, operation);
    operation.unsubscribe = subscribeInputEvents(
      operation,
      operation.execution.inputs?.subscribe,
      (source) => this.isCurrent(source),
      (state, reason) => this.transition(operation, state, reason),
    );
    this.publish(operation, "pending");
  }
  markStopped(sessionId: string): void {
    const item = this.current(sessionId);
    if (item) this.transition(item, "uncertain");
  }
  markAllStopped(): void {
    for (const id of this.active.keys()) this.markStopped(id);
  }
  confirmStopped(sessionId: string): void {
    const item = this.current(sessionId);
    if (item?.state === "uncertain") {
      item.unsubscribe?.();
      this.active.delete(sessionId);
    }
  }
  confirmAllStopped(): void {
    for (const id of this.active.keys()) this.confirmStopped(id);
  }
  settleCommand(operation: InputOperation, outcome: InputCommandOutcome): void {
    if (outcome.kind === "accepted" && operation.state === "pending") {
      operation.state = "accepted";
      this.publish(operation, "accepted");
    } else if (outcome.kind === "uncertain")
      this.transition(operation, "uncertain");
    else if (outcome.kind === "rejected")
      this.transition(operation, "failed", outcome.reason);
  }
  private transition(
    operation: InputOperation,
    state: ManagedInputEvent["state"],
    reason?: InputFailureReason,
  ): void {
    if (!this.isCurrent(operation)) return;
    if (state === "uncertain" && operation.state === "uncertain") return;
    if (state === "accepted") operation.state = "accepted";
    else if (state === "uncertain") operation.state = "uncertain";
    else {
      operation.unsubscribe?.();
      this.active.delete(operation.sessionId);
    }
    this.publish(operation, state, reason);
  }
  private publish(
    operation: InputOperation,
    state: ManagedInputEvent["state"],
    reason?: InputFailureReason,
  ): void {
    this.events.publish({
      sessionId: operation.sessionId,
      inputId: operation.id,
      state,
      ...(reason ? { reason } : {}),
    });
  }
}
