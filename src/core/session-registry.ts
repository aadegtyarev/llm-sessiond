import { randomUUID } from "node:crypto";
import type { HarnessAdapter, HarnessSession } from "./ports.js";
import type { SessionRecord } from "./types.js";
import type { EventBus } from "./event-bus.js";
import { ApiError } from "./api-error.js";
import { assertValidCwd } from "./cwd-validator.js";
import { connectSessionEvents } from "./session-runtime-events.js";
import { watchSessionExit } from "./session-exit.js";

export class SessionRegistry {
  readonly sessions = new Map<string, SessionRecord>();
  private readonly runtimes = new Map<string, HarnessSession>();
  constructor(
    private readonly adapter: HarnessAdapter,
    private readonly events: EventBus,
  ) {}
  async create(cwd: string, name?: string): Promise<SessionRecord> {
    await assertValidCwd(cwd);
    const record: SessionRecord = {
      id: randomUUID(),
      ...(name ? { name } : {}),
      harnessId: "pi",
      cwd,
      status: "starting",
      child: undefined,
      currentInput: undefined,
      pendingSubmit: undefined,
      submitSequence: 0,
      runtimeGeneration: 0,
    };
    this.sessions.set(record.id, record);
    try {
      await this.start(record);
    } catch {
      this.fail(record, "PI_STARTUP_FAILED");
    }
    return record;
  }
  async start(record: SessionRecord, nativeId?: string): Promise<void> {
    const generation = ++record.runtimeGeneration;
    const runtime = await this.adapter.launch(record, nativeId);
    if (generation !== record.runtimeGeneration) {
      await runtime.stop();
      return;
    }
    this.runtimes.set(record.id, runtime);
    record.child = runtime.child;
    record.nativeSessionId = runtime.nativeSessionId;
    record.status = "running";
    this.status(record);
    connectSessionEvents(
      record,
      runtime,
      this.events,
      (session) => this.status(session),
      () => record.runtimeGeneration === generation,
    );
    watchSessionExit(
      record,
      runtime,
      generation,
      (session) => this.publishInterruptedInput(session),
      (session) => this.status(session),
    );
  }
  get(id: string): SessionRecord {
    const record = this.sessions.get(id);
    if (!record) throw new ApiError(404, "NOT_FOUND", "session not found");
    return record;
  }
  list(): SessionRecord[] {
    return [...this.sessions.values()];
  }
  process(record: SessionRecord): HarnessSession {
    const runtime = this.runtimes.get(record.id);
    if (!runtime || !["running", "uncertain"].includes(record.status))
      throw new ApiError(409, "SESSION_NOT_RUNNING", "session is not running");
    return runtime;
  }
  stopProcess(id: string): void {
    this.runtimes.delete(id);
  }
  shutdownProvider(): Promise<void> {
    return this.adapter.shutdown?.() ?? Promise.resolve();
  }
  publishInterruptedInput(record: SessionRecord): void {
    if (record.currentInput)
      this.events.publish(record.id, "input.state", {
        inputId: record.currentInput,
        state: "uncertain",
        reason: "session stopped before completion",
      });
  }
  private fail(record: SessionRecord, code: string): void {
    record.status = "failed";
    record.failure = { code, at: new Date().toISOString() };
    this.status(record);
  }
  status(record: SessionRecord): void {
    this.events.publish(record.id, "session.status", {
      status: record.status,
      ...(record.failure ? { failure: record.failure } : {}),
    });
  }
}
