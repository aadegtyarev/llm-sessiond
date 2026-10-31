import { ApiError } from "./api-error.js";
import type { SessionRegistry } from "./session-registry.js";

export class SessionLifecycle {
  constructor(private readonly registry: SessionRegistry) {}
  async stop(id: string): Promise<void> {
    const record = this.registry.get(id);
    if (record.status === "stopped") return;
    if (record.status !== "running" && record.status !== "uncertain")
      throw new ApiError(409, "SESSION_NOT_RUNNING", "session is not running");
    const runtime = this.registry.process(record);
    record.status = "stopped";
    this.registry.publishInterruptedInput(record);
    this.registry.stopProcess(id);
    await runtime.stop();
    record.child = undefined;
    record.currentInput = undefined;
    this.registry.status(record);
  }
  async resume(id: string): Promise<void> {
    const record = this.registry.get(id);
    if (record.status !== "stopped" || !record.nativeSessionId)
      throw new ApiError(
        409,
        "SESSION_NOT_RESUMABLE",
        "session has no stopped native session",
      );
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
      this.registry.list().map(async (record) => {
        if (record.status === "running" || record.status === "uncertain")
          await this.stop(record.id).catch(() => {});
      }),
    );
  }
}
