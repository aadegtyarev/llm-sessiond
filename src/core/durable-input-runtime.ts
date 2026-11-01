import type { DurableManagerContext } from "./durable-manager-context.js";
import type { PerSessionLock } from "./per-session-lock.js";
import { validateInput } from "./input-validation.js";
import type { ManagedInputEvent } from "./input-runtime-events.js";
import { DurableInputState } from "./durable-input-state.js";
import { observeInputCommand } from "./input-command-outcome.js";
import { admitInput } from "./input-submit-admission.js";
import { runInputCancel } from "./input-cancel-command.js";
import { InputRuntimeError } from "./input-runtime-error.js";
import type { ValidatedInput } from "./input-validation.js";

export class DurableInputRuntime {
  private readonly state = new DurableInputState();
  constructor(
    private readonly context: DurableManagerContext,
    private readonly locks: PerSessionLock,
    private readonly id: () => string,
    private readonly timeoutMs = 5000,
  ) {}
  subscribe(listener: (event: ManagedInputEvent) => void): () => void {
    return this.state.subscribe(listener);
  }
  async submit(sessionId: string, value: unknown) {
    const input: ValidatedInput = validateInput(value);
    const admission = await this.locks.run(sessionId, () =>
      admitInput(this.context, this.state, this.id, sessionId, input),
    );
    const outcome = await observeInputCommand(
      admission.command,
      this.timeoutMs,
    );
    this.state.settleCommand(admission.operation, outcome);
    if (!this.state.isCurrent(admission.operation))
      return { inputId: admission.operation.id, resumed: admission.resumed };
    if (outcome.kind === "uncertain")
      throw new InputRuntimeError(
        "INPUT_UNCERTAIN",
        admission.operation.id,
        admission.resumed,
      );
    if (outcome.kind === "rejected")
      throw new InputRuntimeError(
        "INPUT_REJECTED",
        admission.operation.id,
        admission.resumed,
        outcome.reason,
      );
    return { inputId: admission.operation.id, resumed: admission.resumed };
  }
  cancel(sessionId: string, inputId: string): Promise<void> {
    return runInputCancel(
      this.context,
      this.locks,
      this.state,
      sessionId,
      inputId,
      false,
      this.timeoutMs,
    );
  }
  cancelCurrent(sessionId: string): Promise<void> {
    return runInputCancel(
      this.context,
      this.locks,
      this.state,
      sessionId,
      undefined,
      true,
      this.timeoutMs,
    );
  }
  markStopped(sessionId: string): void {
    this.state.markStopped(sessionId);
  }
  markAllStopped(): void {
    this.state.markAllStopped();
  }
  confirmStopped(sessionId: string): void {
    this.state.confirmStopped(sessionId);
  }
  confirmAllStopped(): void {
    this.state.confirmAllStopped();
  }
}
