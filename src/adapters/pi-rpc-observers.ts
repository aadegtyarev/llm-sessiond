export class PiRpcObservers {
  private readonly listeners = new Set<
    (record: Record<string, unknown>) => void
  >();
  subscribe(listener: (record: Record<string, unknown>) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  publish(record: Record<string, unknown>): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(record);
      } catch {
        /* observer failures are isolated */
      }
    }
  }
  clear(): void {
    this.listeners.clear();
  }
}
