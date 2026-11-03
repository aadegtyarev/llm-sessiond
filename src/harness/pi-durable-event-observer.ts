import type { PiDurableRpcLink } from "./pi-durable-rpc-link.js";

export class PiDurableEventObserver {
  private readonly listeners = new Set<(event: unknown) => void>();
  subscribe(listener: (event: unknown) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  attach(link: PiDurableRpcLink): void {
    link.on("output", (event: unknown) => {
      for (const listener of this.listeners) listener(event);
    });
  }
}
