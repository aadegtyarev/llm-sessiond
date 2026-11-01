import type { HarnessAdapter } from "./ports.js";
import type { SessionInput, SessionRecord } from "./types.js";
import { EventBus } from "./event-bus.js";
import { SessionInputService } from "./session-input-service.js";
import { SessionLifecycle } from "./session-lifecycle.js";
import { SessionRegistry } from "./session-registry.js";
import { ApiError } from "./api-error.js";
export class SessionService {
  private readonly registry: SessionRegistry;
  private readonly inputs = new SessionInputService();
  private readonly lifecycle: SessionLifecycle;
  constructor(
    adapter: HarnessAdapter,
    readonly events = new EventBus(),
  ) {
    this.registry = new SessionRegistry(adapter, events);
    this.lifecycle = new SessionLifecycle(this.registry);
  }
  get sessions(): Map<string, SessionRecord> {
    return this.registry.sessions;
  }
  create(cwd: string, name?: string): Promise<SessionRecord> {
    return this.registry.create(cwd, name);
  }
  get(id: string): SessionRecord {
    return this.registry.get(id);
  }
  list(): SessionRecord[] {
    return this.registry.list();
  }
  input(id: string, input: SessionInput): Promise<string> {
    const record = this.get(id);
    if (record.status !== "running")
      throw new ApiError(
        409,
        "SESSION_NOT_RUNNING",
        "session is not accepting input",
      );
    return this.inputs.submit(
      record,
      this.registry.process(record),
      this.events,
      input,
    );
  }
  cancel(id: string, inputId: string): Promise<void> {
    const record = this.get(id);
    return this.inputs.cancel(
      record,
      this.registry.process(record),
      this.events,
      inputId,
    );
  }
  stop(id: string): Promise<void> {
    return this.lifecycle.stop(id);
  }
  resume(id: string): Promise<void> {
    return this.lifecycle.resume(id);
  }
  shutdown(): Promise<void> {
    return this.lifecycle.shutdown();
  }
}
