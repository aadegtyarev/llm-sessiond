import type { DurableManagerContext } from "./durable-manager-context.js";
import type { PerSessionLock } from "./per-session-lock.js";
import { ControlPlaneError } from "./control-plane-error.js";
import { DurableSessionManagerRead } from "./session-read-metadata.js";
import { assertCurrentOwner } from "./session-lifecycle-support.js";
import { validateSessionId } from "./durable-validation.js";
import { DurableInputState } from "./durable-input-state.js";
import { InputRuntimeError } from "./input-runtime-error.js";
import { admitInputCancel } from "./input-cancel-admission.js";
import { observeInputCommand } from "./input-command-outcome.js";

export async function runInputCancel(
  context: DurableManagerContext,
  locks: PerSessionLock,
  state: DurableInputState,
  sessionId: string,
  inputId: string | undefined,
  current: boolean,
  timeoutMs: number,
): Promise<void> {
  const command = await locks.run(sessionId, async () => {
    DurableSessionManagerRead.get(context.store, sessionId);
    assertCurrentOwner(context);
    if (inputId !== undefined) {
      try {
        validateSessionId(inputId);
      } catch {
        throw new ControlPlaneError("INVALID_INPUT");
      }
    }
    const operation = state.current(sessionId);
    if (!operation) throw new ControlPlaneError("INPUT_NOT_CURRENT");
    return admitInputCancel(
      context,
      sessionId,
      inputId ?? operation.id,
      current,
      operation,
    );
  });
  const outcome = await observeInputCommand(command.promise, timeoutMs);
  if (!state.isCurrent(command.operation)) return;
  if (outcome.kind === "uncertain") {
    state.settleCancel(command.operation, outcome);
    throw new InputRuntimeError("INPUT_UNCERTAIN", command.operation.id, false);
  }
  if (outcome.kind === "rejected") {
    state.settleCancel(command.operation, outcome);
    throw new InputRuntimeError(
      "OPERATION_FAILED",
      command.operation.id,
      false,
      outcome.reason,
    );
  }
}
