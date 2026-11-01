import type { DurableManagerContext } from "./durable-manager-context.js";
import type { PerSessionLock } from "./per-session-lock.js";
import type { ManagedInputEvent } from "./input-runtime-events.js";
import { DurableInputState } from "./durable-input-state.js";
import { observeInputCommand } from "./input-command-outcome.js";
import { admitInput } from "./input-submit-admission.js";
import { runInputCancel } from "./input-cancel-command.js";
import { inputSubmitResult } from "./input-submit-result.js";

export class DurableInputRuntime {
  private readonly state: DurableInputState;
  constructor(
    private readonly context: DurableManagerContext,
    private readonly locks: PerSessionLock,
    private readonly id: () => string,
    private readonly timeoutMs = 5000,
  ) {
    this.state = context.inputState;
  }
  subscribe(listener: (event: ManagedInputEvent) => void): () => void {
    return this.state.subscribe(listener);
  }
  async submit(sessionId: string, value: unknown) {
    const admission = await this.locks.run(sessionId, () =>
      admitInput(this.context, this.state, this.id, sessionId, value),
    );
    const outcome = await observeInputCommand(
      admission.command,
      this.timeoutMs,
    );
    this.state.settleCommand(admission.operation, outcome);
    return inputSubmitResult(admission.operation, outcome);
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
  markStopping(
    sessionId: string,
    execution: import("./lifecycle-execution.js").LifecycleExecution,
  ): void {
    this.state.markStopping(sessionId, execution);
  }
}
