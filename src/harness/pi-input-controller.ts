import type { ImageInput } from "../core/types.js";
import { RpcLink } from "./rpc-link.js";
import { cancelPiInput } from "./pi-input-cancel.js";
import { submitPiInput } from "./pi-input-submit.js";

export class PiInputController {
  private activeInput: string | undefined;
  private accepted = false;
  private uncertain = false;
  private canceling = false;
  private settled = false;
  private announced = false;
  constructor(
    private readonly link: RpcLink,
    private readonly emit: (
      type: string,
      data: Record<string, unknown>,
    ) => void,
  ) {}
  isActive = (inputId: string) => this.activeInput === inputId;
  submit(text: string, images?: ImageInput[]): Promise<string> {
    return submitPiInput(
      this.link,
      text,
      images,
      {
        busy: () => Boolean(this.activeInput),
        begin: (id) => {
          this.activeInput = id;
          this.accepted = false;
          this.uncertain = false;
          this.canceling = false;
          this.settled = false;
          this.announced = false;
        },
        accepted: () => {
          this.accepted = true;
        },
        rejected: () => this.reset(),
        uncertain: () => {
          this.uncertain = true;
        },
      },
      (type, data) => this.emit(type, data),
    );
  }
  cancel(inputId: string): Promise<void> {
    return cancelPiInput(
      this.link,
      inputId,
      {
        canCancel: () =>
          this.activeInput === inputId &&
          this.accepted &&
          !this.uncertain &&
          !this.canceling,
        begin: () => {
          this.canceling = true;
        },
        uncertain: () => {
          this.uncertain = true;
        },
        rejected: () => {
          this.canceling = false;
        },
        canceled: () => this.reset(),
      },
      (type, data) => this.emit(type, data),
    );
  }
  acceptInput(inputId: string): void {
    if (this.activeInput !== inputId) return;
    this.announced = true;
    if (this.settled && this.accepted) this.complete(inputId);
  }
  onAgentSettled(): void {
    this.emit("turn.completed", {});
    if (!this.activeInput) return;
    if (this.uncertain) {
      this.reset();
      return;
    }
    if (this.accepted && this.announced && !this.canceling)
      this.complete(this.activeInput);
    else this.settled = true;
  }
  private complete(inputId: string): void {
    this.emit("input.state", { inputId, state: "completed" });
    this.reset();
  }
  private reset(): void {
    this.activeInput = undefined;
    this.accepted = false;
    this.uncertain = false;
    this.canceling = false;
    this.settled = false;
    this.announced = false;
  }
}
