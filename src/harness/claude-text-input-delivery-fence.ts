import type { InputCommandOutcome } from "../core/execution-input-port.js";
import type { ClaudeInputEvent } from "./claude-text-input-types.js";

export class ClaudeTextInputDeliveryFence {
  fenced = false;
  accepted = false;
  private commandResolved = false;
  private resolve?: (outcome: InputCommandOutcome) => void;
  constructor(private readonly clearTimer: () => void) {}
  setResolver(resolve: (outcome: InputCommandOutcome) => void): void {
    this.resolve = resolve;
  }
  accept(id: string, emit: (event: ClaudeInputEvent) => void): void {
    if (this.fenced || this.accepted) return;
    this.accepted = this.commandResolved = true;
    this.clearTimer();
    this.resolve?.({ kind: "accepted" });
    emit({ inputId: id, state: "accepted" });
  }
  stopIntent(id: string, emit: (event: ClaudeInputEvent) => void): void {
    if (this.fenced) return;
    this.fence();
    if (this.accepted) emit({ inputId: id, state: "uncertain" });
    else this.resolveUncertain(id, emit);
  }
  terminal(id: string, emit: (event: ClaudeInputEvent) => void): void {
    if (this.fenced) return;
    this.fence();
    this.resolveUncertain(id, emit);
  }
  uncertain(id: string, emit: (event: ClaudeInputEvent) => void): void {
    if (this.fenced) return;
    this.fence();
    this.resolveUncertain(id, emit);
  }
  fence(): void {
    this.fenced = true;
    this.clearTimer();
  }
  private resolveUncertain(
    id: string,
    emit: (event: ClaudeInputEvent) => void,
  ): void {
    if (this.commandResolved) return;
    this.commandResolved = true;
    this.resolve?.({ kind: "uncertain" });
    emit({ inputId: id, state: "uncertain" });
  }
}
