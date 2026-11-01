import { ApiError } from "./api-error.js";
import type { SessionRegistry } from "./session-registry.js";

export class SessionLifecycle {
  private readonly locks = new Map<string, Promise<void>>();
  constructor(private readonly registry: SessionRegistry) {}
  stop(id: string): Promise<void> {
    return this.exclusive(id, () => this.stopLocked(id));
  }
  private async stopLocked(id: string): Promise<void> {
    const record = this.registry.get(id);
    if (record.status === "stopped") return;
    if (record.status !== "running" && record.status !== "uncertain")
      throw new ApiError(409, "SESSION_NOT_RUNNING", "session is not running");
    const runtime = this.registry.process(record);
    record.status = "stopped";
    record.runtimeGeneration++;
    this.registry.publishInterruptedInput(record);
    record.currentInput = undefined;
    record.pendingSubmit = undefined;
    this.registry.stopProcess(id);
    await runtime.stop();
    record.child = undefined;
    record.currentInput = undefined;
    this.registry.status(record);
  }
  resume(id: string): Promise<void> {
    return this.exclusive(id, () => this.resumeLocked(id));
  }
  private async resumeLocked(id: string): Promise<void> {
    const record = this.registry.get(id);
    if (record.status !== "stopped" || !record.nativeSessionId)
      throw new ApiError(
        409,
        "SESSION_NOT_RESUMABLE",
        "session has no stopped native session",
      );
    record.currentInput = undefined;
    record.pendingSubmit = undefined;
    record.status = "starting";
    this.registry.status(record);
    try {
      await this.registry.start(record, record.nativeSessionId);
    } catch {
      record.status = "failed";
      record.failure = {
        code: "PI_RESUME_FAILED",
        at: new Date().toISOString(),
      };
      this.registry.status(record);
      throw new ApiError(409, "RESUME_FAILED", "session could not be resumed");
    }
  }
  async shutdown(): Promise<void> {
    await Promise.all(
      this.registry.list().map((record) =>
        this.exclusive(record.id, async () => {
          if (record.status === "running" || record.status === "uncertain")
            await this.stopLocked(record.id).catch(() => {});
        }),
      ),
    );
    await this.registry.shutdownProvider();
  }
  private async exclusive(
    id: string,
    action: () => Promise<void>,
  ): Promise<void> {
    const previous = this.locks.get(id) ?? Promise.resolve();
    let release = () => {};
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(id, current);
    await previous;
    try {
      await action();
    } finally {
      release();
      if (this.locks.get(id) === current) this.locks.delete(id);
    }
  }
}
