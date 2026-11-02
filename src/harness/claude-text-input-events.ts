import type { ExecutionInputEvent } from "../core/execution-input-port.js";
import type { ClaudeInputEvent } from "./claude-text-input-types.js";

export class ClaudeTextInputEvents {
  private listeners = new Set<(event: unknown) => void>();
  publish(event: ExecutionInputEvent | ClaudeInputEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {}
    }
  }
  subscribe(listener: (event: unknown) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
