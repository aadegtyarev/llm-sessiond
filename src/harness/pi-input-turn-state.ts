export type TurnEvent = (type: string, data: Record<string, unknown>) => void;

export class PiInputTurnState {
  protected inputId: string | undefined;
  protected promptAccepted = false;
  protected uncertainDelivery = false;
  protected canceling = false;
  protected cancelAcknowledged = false;
  protected settled = false;
  protected announced = false;
  constructor(protected readonly emit: TurnEvent) {}
  protected complete(): void {
    const inputId = this.inputId;
    if (inputId) this.emit("input.state", { inputId, state: "completed" });
    this.reset();
  }
  protected cancelled(): void {
    const inputId = this.inputId;
    if (inputId)
      this.emit("input.state", {
        inputId,
        state: "failed",
        reason: "cancelled",
      });
    this.reset();
  }
  protected reset(): void {
    this.inputId = undefined;
    this.promptAccepted = false;
    this.uncertainDelivery = false;
    this.canceling = false;
    this.cancelAcknowledged = false;
    this.settled = false;
    this.announced = false;
  }
}
