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
  if (
    operation.terminal === "stopped" ||
    operation.stopInvalidated ||
    operation.executionEnded ||
    !operation.source.live
  )
    throw new InputRuntimeError(
      "INPUT_UNCERTAIN",
      operation.id,
      operation.resumed,
    );
  if (
    operation.terminal === "failed" &&
    operation.failureReason === "prompt_rejected"
  )
    throw new InputRuntimeError(
      "INPUT_REJECTED",
      operation.id,
      operation.resumed,
      operation.failureReason,
    );
  return { inputId: operation.id, resumed: operation.resumed };
}
