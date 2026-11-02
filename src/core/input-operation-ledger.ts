import type {
  InputCancelOutcome,
  InputCommandOutcome,
} from "./execution-input-port.js";
import type { ExecutionInputSource } from "./execution-input-source.js";
import type { ManagedInputEvent } from "./input-runtime-events.js";
import { InputEventObservers } from "./input-runtime-events.js";
import type { InputOperation } from "./durable-input-state.js";
import { InputOperationEvents } from "./input-operation-events.js";

export class InputOperationLedger {
  private readonly active = new Map<string, InputOperation>();
  private readonly ids = new Set<string>();
  private readonly events = new InputEventObservers();
  private readonly transitions = new InputOperationEvents(
    this.active,
    this.events,
  );
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
    this.events.publish({
      sessionId: operation.sessionId,
      inputId: operation.id,
      state: "pending",
    });
  }
  markStopping(sessionId: string, source: ExecutionInputSource): void {
    this.transitions.markStopping(sessionId, source);
  }
  confirmExecution(sessionId: string, source: ExecutionInputSource): void {
    this.transitions.confirmExecution(sessionId, source);
  }
  settleCommand(operation: InputOperation, outcome: InputCommandOutcome): void {
    this.transitions.settleCommand(operation, outcome);
  }
  settleCancel(operation: InputOperation, outcome: InputCancelOutcome): void {
    this.transitions.settleCancel(operation, outcome);
  }
  receive(source: ExecutionInputSource, value: unknown): void {
    this.transitions.receive(source, value);
  }
}
