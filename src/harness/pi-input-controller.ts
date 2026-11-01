import type { ImageInput } from "../core/types.js";
import { RpcLink } from "./rpc-link.js";
import { cancelPiInput } from "./pi-input-cancel.js";
import { submitPiInput } from "./pi-input-submit.js";
import { PiInputTurn } from "./pi-input-turn.js";

export class PiInputController {
  private readonly turn: PiInputTurn;
  constructor(
    private readonly link: RpcLink,
    private readonly emit: (
      type: string,
      data: Record<string, unknown>,
    ) => void,
  ) {
    this.turn = new PiInputTurn(emit);
  }
  isActive = (inputId: string) => this.turn.isActive(inputId);
  submit(text: string, images?: ImageInput[]): Promise<string> {
    return submitPiInput(this.link, text, images, this.turn, this.emit);
  }
  cancel(inputId: string): Promise<void> {
    return cancelPiInput(this.link, inputId, this.turn, this.emit);
  }
  acceptInput(inputId: string): void {
    this.turn.acceptInput(inputId);
  }
  onAgentSettled(): void {
    this.turn.onSettled();
  }
}
