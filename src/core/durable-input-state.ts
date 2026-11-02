import type { LifecycleExecution } from "./lifecycle-execution.js";
import type {
  InputCancelOutcome,
  InputCommandOutcome,
  InputFailureReason,
} from "./execution-input-port.js";
import type { ManagedInputEvent } from "./input-runtime-events.js";
import {
  ExecutionInputSources,
  type ExecutionInputSource,
} from "./execution-input-source.js";
import { InputOperationLedger } from "./input-operation-ledger.js";

export type InputRecordState =
  "pending" | "accepted" | "uncertain" | "canceling";
export interface InputOperation {
  id: string;
  sessionId: string;
  execution: LifecycleExecution;
  source: ExecutionInputSource;
  state: InputRecordState;
  resumed: boolean;
  terminal?: "completed" | "failed" | "stopped";
  failureReason?: InputFailureReason | undefined;
  stopInvalidated: boolean;
  executionEnded: boolean;
}
export class DurableInputState {
  private readonly ledger = new InputOperationLedger();
  private readonly sources = new ExecutionInputSources((source, event) =>
    this.ledger.receive(source, event),
  );
  subscribe(listener: (event: ManagedInputEvent) => void): () => void {
    return this.ledger.subscribe(listener);
  }
  trackExecution(
    sessionId: string,
    execution: LifecycleExecution,
  ): ExecutionInputSource {
    return this.sources.track(sessionId, execution);
  }
  source(
    sessionId: string,
    execution: LifecycleExecution,
  ): ExecutionInputSource | undefined {
    return this.sources.get(sessionId, execution);
  }
  sourceIsCurrent(source: ExecutionInputSource): boolean {
    return this.sources.isCurrent(source);
  }
  reserve(id: string): boolean {
    return this.ledger.reserve(id);
  }
  current(sessionId: string): InputOperation | undefined {
    return this.ledger.current(sessionId);
  }
  isCurrent(operation: InputOperation): boolean {
    return this.ledger.isCurrent(operation);
  }
  register(operation: InputOperation): void {
    this.ledger.register(operation);
  }
  markStopping(sessionId: string, execution: LifecycleExecution): void {
    const source = this.source(sessionId, execution);
    if (!source) return;
    source.stopping = true;
    this.ledger.markStopping(sessionId, source);
  }
  confirmExecution(sessionId: string, execution: LifecycleExecution): boolean {
    const source = this.source(sessionId, execution);
    if (!source) return false;
    this.ledger.confirmExecution(sessionId, source);
    this.sources.close(source);
    return true;
  }
  settleCommand(operation: InputOperation, outcome: InputCommandOutcome): void {
    this.ledger.settleCommand(operation, outcome);
  }
  settleCancel(operation: InputOperation, outcome: InputCancelOutcome): void {
    this.ledger.settleCancel(operation, outcome);
  }
}
