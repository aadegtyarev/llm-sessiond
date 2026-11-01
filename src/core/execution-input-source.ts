import type { LifecycleExecution } from "./lifecycle-execution.js";

export interface ExecutionInputSource {
  sessionId: string;
  execution: LifecycleExecution;
  generation: number;
  live: boolean;
  subscribed: boolean;
  closed: boolean;
  unsubscribe?: () => void;
}
export class ExecutionInputSources {
  private readonly current = new Map<string, ExecutionInputSource>();
  private readonly generations = new Map<string, number>();
  constructor(
    private readonly receive: (
      source: ExecutionInputSource,
      event: unknown,
    ) => void,
  ) {}
  track(
    sessionId: string,
    execution: LifecycleExecution,
  ): ExecutionInputSource {
    const generation = (this.generations.get(sessionId) ?? 0) + 1;
    this.generations.set(sessionId, generation);
    const source: ExecutionInputSource = {
      sessionId,
      execution,
      generation,
      live: true,
      subscribed: false,
      closed: false,
    };
    this.current.set(sessionId, source);
    const port = execution.inputs;
    if (!port) {
      source.live = false;
      return source;
    }
    try {
      const unsubscribe = port.subscribe((event) =>
        this.forward(source, event),
      );
      if (typeof unsubscribe !== "function")
        throw new Error("INVALID_SUBSCRIPTION");
      source.unsubscribe = unsubscribe;
      source.subscribed = true;
    } catch {
      source.live = false;
    }
    return source;
  }
  get(
    sessionId: string,
    execution: LifecycleExecution,
  ): ExecutionInputSource | undefined {
    const source = this.current.get(sessionId);
    return source?.execution === execution ? source : undefined;
  }
  isCurrent(source: ExecutionInputSource): boolean {
    return this.current.get(source.sessionId) === source && !source.closed;
  }
  close(source: ExecutionInputSource): void {
    if (source.closed) return;
    source.live = false;
    source.closed = true;
    if (this.current.get(source.sessionId) === source)
      this.current.delete(source.sessionId);
    try {
      source.unsubscribe?.();
    } catch {
      /* Cleanup cannot retain a dead source. */
    }
  }
  private forward(source: ExecutionInputSource, event: unknown): void {
    if (!this.isCurrent(source)) return;
    try {
      this.receive(source, event);
    } catch {
      /* Adapter payloads are untrusted. */
    }
  }
}
