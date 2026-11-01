import type { ExecutionInputSource } from "./execution-input-source.js";
import { normalizeInputEvent } from "./input-event-normalize.js";
import type { InputOperation } from "./durable-input-state.js";

export class InputOperationEventReceiver {
  constructor(
    private readonly active: Map<string, InputOperation>,
    private readonly uncertain: (operation: InputOperation) => void,
    private readonly terminal: (
      operation: InputOperation,
      state: "completed" | "failed",
      reason?: InputOperation["failureReason"],
    ) => void,
    private readonly accepted: (operation: InputOperation) => void,
  ) {}
  receive(source: ExecutionInputSource, value: unknown): void {
    const event = normalizeInputEvent(value);
    if (!event) return;
    const operation = this.active.get(source.sessionId);
    if (event.kind === "execution-ended") {
      source.live = false;
      if (operation?.source === source) {
        operation.executionEnded = true;
        this.uncertain(operation);
      }
      return;
    }
    if (
      !operation ||
      operation.source !== source ||
      operation.id !== event.inputId
    )
      return;
    if (event.state === "accepted") {
      if (
        operation.state === "pending" &&
        !operation.executionEnded &&
        !operation.stopInvalidated
      ) {
        operation.state = "accepted";
        this.accepted(operation);
      }
      return;
    }
    if (event.state === "uncertain") {
      this.uncertain(operation);
      return;
    }
    this.terminal(operation, event.state, event.reason);
  }
}
