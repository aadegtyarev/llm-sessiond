import type { PiDurableInputEvent } from "./pi-durable-input-event.js";

export type PiDurablePortEvent =
  PiDurableInputEvent | { kind: "execution-ended" };
export class PiDurableInputEvents {
  private readonly listeners = new Set<(event: unknown) => void>();
  subscribe(listener: (event: unknown) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  publish(event: PiDurablePortEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
