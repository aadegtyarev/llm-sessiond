import type { ProcessProvider } from "../core/ports.js";
import type {
  LifecycleExecution,
  LifecycleLaunchResult,
} from "../core/lifecycle-execution.js";
import type { AdapterCheckpoint } from "../core/adapter-contracts.js";
import type { JsonValue } from "../core/generic-json.js";
import { piCheckpoint, PiLifecycleAdapter } from "./pi-lifecycle-adapter.js";
import type { ChildTerminator } from "../process/child-stop.js";
import { PiDurableProcess } from "./pi-durable-process.js";
export class PiLifecycleExecution implements LifecycleExecution {
  private readonly process: PiDurableProcess;
  get inputs() {
    return this.process.inputs;
  }
  constructor(
    private readonly adapter: PiLifecycleAdapter,
    private readonly provider: ProcessProvider,
    private readonly executable: string,
    private readonly readinessTimeoutMs: number,
    private readonly terminate?: ChildTerminator,
  ) {
    this.process = new PiDurableProcess(
      provider,
      executable,
      readinessTimeoutMs,
      terminate,
    );
  }
  async launch(input: {
    cwd: string;
    options?: JsonValue;
  }): Promise<LifecycleLaunchResult> {
    this.rejectOptions(input.options);
    const nativeSessionId = await this.process.start(input.cwd, []);
    return { nativeSessionId, checkpoint: piCheckpoint(nativeSessionId) };
  }
  async resume(input: {
    cwd: string;
    options?: JsonValue;
    checkpoint?: AdapterCheckpoint;
    nativeSessionId?: string;
  }): Promise<LifecycleLaunchResult> {
    this.rejectOptions(input.options);
    if (
      !input.checkpoint ||
      input.checkpoint.namespace !== this.adapter.checkpoint.namespace ||
      input.checkpoint.version !== this.adapter.checkpoint.version ||
      !this.adapter.validateCheckpoint(input.checkpoint.data)
    )
      throw new Error("INVALID_CHECKPOINT");
    const sessionId = (input.checkpoint!.data as { sessionId: string })
      .sessionId;
    if (
      input.nativeSessionId !== undefined &&
      input.nativeSessionId !== sessionId
    )
      throw new Error("SESSION_ID_MISMATCH");
    const nativeSessionId = await this.process.start(
      input.cwd,
      ["--session", sessionId],
      sessionId,
    );
    return { nativeSessionId, checkpoint: piCheckpoint(nativeSessionId) };
  }
  stop(): Promise<void> {
    return this.process.stop();
  }
  private rejectOptions(options: JsonValue | undefined): void {
    if (options !== undefined) throw new Error("UNSUPPORTED_OPTIONS");
  }
}
