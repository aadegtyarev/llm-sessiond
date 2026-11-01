import type { DurableManagerContext } from "./durable-manager-context.js";
import { ControlPlaneError } from "./control-plane-error.js";
import type {
  DurableInputState,
  InputOperation,
} from "./durable-input-state.js";
import { InputRuntimeError } from "./input-runtime-error.js";
import type { ValidatedInput } from "./input-validation.js";
import { assertCurrentOwner } from "./session-lifecycle-support.js";

export function dispatchAdmittedInput(
  context: DurableManagerContext,
  state: DurableInputState,
  operation: InputOperation,
  input: ValidatedInput,
) {
  const port = operation.execution.inputs!;
  const submit = port.submit;
  const commandInput = { inputId: operation.id, ...input };
  state.register(operation);
  let ownerFailure: unknown;
  try {
    assertCurrentOwner(context);
  } catch (error) {
    ownerFailure = error;
  }
  if (
    ownerFailure ||
    !state.isCurrent(operation) ||
    operation.state !== "pending" ||
    operation.stopInvalidated ||
    operation.executionEnded ||
    context.owned.get(operation.sessionId) !== operation.execution ||
    !state.sourceIsCurrent(operation.source) ||
    !operation.source.live
  ) {
    state.settleCommand(operation, { kind: "uncertain" });
    if (ownerFailure instanceof ControlPlaneError)
      throw new InputRuntimeError(
        ownerFailure.code,
        operation.id,
        operation.resumed,
      );
    throw new InputRuntimeError(
      "INPUT_UNCERTAIN",
      operation.id,
      operation.resumed,
    );
  }
  let command: Promise<unknown>;
  try {
    command = Promise.resolve(Reflect.apply(submit, port, [commandInput]));
  } catch {
    command = Promise.resolve({ kind: "uncertain" });
  }
  return { operation, command };
}
