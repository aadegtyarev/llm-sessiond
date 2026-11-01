import type { InputCommandOutcome } from "./execution-input-port.js";
import type { InputOperation } from "./durable-input-state.js";
import { InputRuntimeError } from "./input-runtime-error.js";

export function inputSubmitResult(
  operation: InputOperation,
  outcome: InputCommandOutcome,
): { inputId: string; resumed: boolean } {
  if (outcome.kind === "rejected")
    throw new InputRuntimeError(
      "INPUT_REJECTED",
      operation.id,
      operation.resumed,
      outcome.reason,
    );
  if (outcome.kind === "uncertain")
    throw new InputRuntimeError(
      "INPUT_UNCERTAIN",
      operation.id,
      operation.resumed,
    );
  if (operation.terminal === "failed")
    throw new InputRuntimeError(
      "INPUT_REJECTED",
      operation.id,
      operation.resumed,
      operation.failureReason,
    );
  if (
    operation.terminal === "stopped" ||
    operation.stopInvalidated ||
    operation.executionEnded
  )
    throw new InputRuntimeError(
      "INPUT_UNCERTAIN",
      operation.id,
      operation.resumed,
    );
  return { inputId: operation.id, resumed: operation.resumed };
}
