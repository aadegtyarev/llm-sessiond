import type { PiDurableInputEvent } from "./pi-durable-input-event.js";
import type { PiDurableCurrentInput } from "./pi-durable-input-cancel.js";

export class PiDurableInputCompletion {
  private timer: NodeJS.Timeout | undefined;
  clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
  schedule(
    current: PiDurableCurrentInput,
    dead: boolean,
    isCurrent: () => boolean,
    publish: (event: PiDurableInputEvent) => void,
    complete: () => void,
  ): void {
    if (dead || !isCurrent() || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (dead || !isCurrent()) return;
      complete();
      publish(
        current.abortAccepted
          ? { inputId: current.id, state: "failed", reason: "canceled" }
          : { inputId: current.id, state: "completed" },
      );
    }, 0);
  }
}
