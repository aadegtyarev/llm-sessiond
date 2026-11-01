import type { AdapterCheckpoint } from "../core/adapter-contracts.js";
import type { JsonValue } from "../core/generic-json.js";
import type {
  LifecycleExecution,
  LifecycleLaunchResult,
} from "../core/lifecycle-execution.js";
import type { ProcessProvider } from "../core/ports.js";
import type { ChildTerminator } from "../process/child-stop.js";
import {
  claudeCheckpoint,
  ClaudeLifecycleAdapter,
  isClaudeSessionId,
} from "./claude-lifecycle-adapter.js";
import { ClaudeLifecycleProcess } from "./claude-lifecycle-process.js";

export class ClaudeLifecycleExecution implements LifecycleExecution {
  private lifecycleProcess?: ClaudeLifecycleProcess;
  private started = false;
  private stopped = false;
  constructor(
    private readonly adapter: ClaudeLifecycleAdapter,
    private readonly provider: ProcessProvider,
    private readonly executable: string,
    private readonly readinessTimeoutMs: number,
    private readonly id: () => string,
    private readonly terminate?: ChildTerminator,
  ) {}
  async launch(input: {
    cwd: string;
    options?: JsonValue;
  }): Promise<LifecycleLaunchResult> {
    this.rejectOptions(input.options);
    const sessionId = this.id();
    if (!isClaudeSessionId(sessionId)) throw new Error("INVALID_SESSION_ID");
    await this.start(input.cwd, ["--session-id", sessionId], sessionId);
    return {
      nativeSessionId: sessionId,
      checkpoint: claudeCheckpoint(sessionId),
    };
  }
  async resume(input: {
    cwd: string;
    options?: JsonValue;
    checkpoint?: AdapterCheckpoint;
    nativeSessionId?: string;
  }): Promise<LifecycleLaunchResult> {
    this.rejectOptions(input.options);
    const checkpoint = input.checkpoint;
    if (
      !checkpoint ||
      checkpoint.namespace !== this.adapter.checkpoint.namespace ||
      checkpoint.version !== this.adapter.checkpoint.version ||
      !this.adapter.validateCheckpoint(checkpoint.data)
    )
      throw new Error("INVALID_CHECKPOINT");
    const sessionId = (checkpoint.data as { sessionId: string }).sessionId;
    if (
      input.nativeSessionId !== undefined &&
      input.nativeSessionId !== sessionId
    )
      throw new Error("SESSION_ID_MISMATCH");
    await this.start(input.cwd, ["--resume", sessionId], sessionId);
    return {
      nativeSessionId: sessionId,
      checkpoint: claudeCheckpoint(sessionId),
    };
  }
  async stop(): Promise<void> {
    if (this.stopped) return;
    await this.lifecycleProcess?.stop();
    this.stopped = true;
  }
  private async start(
    cwd: string,
    args: string[],
    expectedId: string,
  ): Promise<void> {
    if (this.started || this.stopped)
      throw new Error("EXECUTION_ALREADY_STARTED");
    this.started = true;
    this.lifecycleProcess = new ClaudeLifecycleProcess(
      this.provider,
      this.executable,
      this.readinessTimeoutMs,
      this.terminate,
    );
    await this.lifecycleProcess.start(cwd, args, expectedId);
  }
  private rejectOptions(options: JsonValue | undefined): void {
    if (options !== undefined) throw new Error("UNSUPPORTED_OPTIONS");
  }
}
