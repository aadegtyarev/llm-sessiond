import type {
  InputCommandOutcome,
  InputFailureReason,
} from "./execution-input-port.js";
import type { ExecutionInputSource } from "./execution-input-source.js";
import type { ManagedInputEvent } from "./input-runtime-events.js";
import { InputEventObservers } from "./input-runtime-events.js";
import { InputOperationEventReceiver } from "./input-operation-event-receiver.js";
import type { InputOperation } from "./durable-input-state.js";

export class InputOperationEvents {
  private readonly receiver: InputOperationEventReceiver;
  constructor(
    private readonly active: Map<string, InputOperation>,
    private readonly events: InputEventObservers,
  ) {
    this.receiver = new InputOperationEventReceiver(
      active,
      (operation) => this.uncertain(operation),
      (operation, state, reason) => this.terminal(operation, state, reason),
      (operation) => this.publish(operation, "accepted"),
    );
  }
  receive(source: ExecutionInputSource, value: unknown): void {
    this.receiver.receive(source, value);
  }
  markStopping(sessionId: string, source: ExecutionInputSource): void {
    const operation = this.active.get(sessionId);
    if (!operation || operation.source !== source) return;
    operation.stopInvalidated = true;
    this.uncertain(operation);
  }
  confirmExecution(sessionId: string, source: ExecutionInputSource): void {
    const operation = this.active.get(sessionId);
    if (operation?.source !== source) return;
    operation.stopInvalidated = true;
    if (operation.state !== "uncertain") this.uncertain(operation);
    operation.terminal = "stopped";
    this.active.delete(sessionId);
  }
  settleCommand(operation: InputOperation, outcome: InputCommandOutcome): void {
    if (!this.isCurrent(operation) || operation.terminal) return;
    if (
      outcome.kind === "accepted" &&
      operation.state === "pending" &&
      !operation.stopInvalidated &&
      operation.source.live
    ) {
      operation.state = "accepted";
      this.publish(operation, "accepted");
    } else if (outcome.kind === "uncertain") this.uncertain(operation);
    else if (outcome.kind === "rejected")
      this.terminal(operation, "failed", outcome.reason);
  }
  settleCancel(operation: InputOperation, outcome: InputCommandOutcome): void {
    if (!this.isCurrent(operation) || operation.terminal) return;
    if (outcome.kind === "uncertain") this.uncertain(operation);
    else if (outcome.kind === "rejected" && operation.state === "canceling")
      operation.state = "accepted";
  }
  private isCurrent(operation: InputOperation): boolean {
    return this.active.get(operation.sessionId) === operation;
  }
  private uncertain(operation: InputOperation): void {
    if (
      !this.isCurrent(operation) ||
      operation.terminal ||
      operation.state === "uncertain"
    )
      return;
    operation.state = "uncertain";
    this.publish(operation, "uncertain");
  }
  private terminal(
    operation: InputOperation,
    state: "completed" | "failed",
    reason?: InputFailureReason,
  ): void {
    if (!this.isCurrent(operation) || operation.terminal) return;
    operation.terminal = state;
    operation.failureReason = reason;
    this.active.delete(operation.sessionId);
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
