import type { InputFailureReason } from "./execution-input-port.js";

export type ManagedInputState =
  "pending" | "accepted" | "completed" | "failed" | "uncertain";
export interface ManagedInputEvent {
  sessionId: string;
  inputId: string;
  state: ManagedInputState;
  reason?: InputFailureReason;
}
export class InputEventObservers {
  private readonly listeners = new Set<(event: ManagedInputEvent) => void>();
  subscribe(listener: (event: ManagedInputEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  publish(event: ManagedInputEvent): void {
    for (const listener of this.listeners) {
      try {
        listener({ ...event });
      } catch {
        this.listeners.delete(listener);
      }
    }
  }
}
