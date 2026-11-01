import type { CancelState } from "./pi-input-cancel.js";
import type { SubmitState } from "./pi-input-submit.js";
import { PiInputTurnState, type TurnEvent } from "./pi-input-turn-state.js";

export class PiInputTurn
  extends PiInputTurnState
  implements SubmitState, CancelState
{
  constructor(emit: TurnEvent) {
    super(emit);
  }
  busy(): boolean {
    return Boolean(this.inputId);
  }
  isActive(inputId: string): boolean {
    return this.inputId === inputId;
  }
  begin(id: string): void {
    this.inputId = id;
    this.promptAccepted = false;
    this.uncertainDelivery = false;
    this.canceling = false;
    this.cancelAcknowledged = false;
    this.settled = false;
    this.announced = false;
  }
  accepted(): void {
    this.promptAccepted = true;
  }
  rejected(): void {
    this.reset();
  }
  uncertain(): boolean {
    this.canceling = false;
    if (!this.inputId) return false;
    if (this.settled) {
      this.complete();
      return false;
    }
    this.uncertainDelivery = true;
    return true;
  }
  canCancel(inputId: string): boolean {
    return (
      this.inputId === inputId &&
      this.promptAccepted &&
      !this.uncertainDelivery &&
      !this.canceling &&
      !this.cancelAcknowledged
    );
  }
  beginCancel(): void {
    this.canceling = true;
  }
  abortRejected(): void {
    this.canceling = false;
    if (this.settled) this.complete();
  }
  acknowledged(): void {
    this.canceling = false;
    this.cancelAcknowledged = true;
    if (this.settled) this.cancelled();
  }
  acceptInput(inputId: string): void {
    if (this.inputId !== inputId) return;
    this.announced = true;
    if (this.settled && this.promptAccepted && !this.canceling) this.complete();
  }
  onSettled(): void {
    this.emit("turn.completed", {});
    if (!this.inputId) return;
    this.settled = true;
    if (this.canceling) return;
    if (this.cancelAcknowledged) this.cancelled();
    else if (this.uncertainDelivery || (this.promptAccepted && this.announced))
      this.complete();
  }
}
