import type { ChildProcess } from "node:child_process";
import type { ProcessProvider } from "../core/ports.js";
import type {
  LifecycleExecution,
  LifecycleLaunchResult,
} from "../core/lifecycle-execution.js";
import type { AdapterCheckpoint } from "../core/adapter-contracts.js";
import type { JsonValue } from "../core/generic-json.js";
import { piCheckpoint, PiLifecycleAdapter } from "./pi-lifecycle-adapter.js";
import { startPiProcess } from "./pi-startup.js";
import type { PiRpcProcess } from "./pi-process.js";
import { ChildStop, type ChildTerminator } from "../process/child-stop.js";
export class PiLifecycleExecution implements LifecycleExecution {
  private child?: ChildProcess;
  private stopped = false;
  private childStop?: ChildStop;
  constructor(
    private readonly adapter: PiLifecycleAdapter,
    private readonly provider: ProcessProvider,
    private readonly executable: string,
    private readonly readinessTimeoutMs: number,
    private readonly terminate?: ChildTerminator,
  ) {}
  async launch(input: {
    cwd: string;
    options?: JsonValue;
  }): Promise<LifecycleLaunchResult> {
    this.rejectOptions(input.options);
    const process = await this.start(input.cwd, []);
    return {
      nativeSessionId: process.nativeSessionId,
      checkpoint: piCheckpoint(process.nativeSessionId),
    };
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
    const process = await this.start(
      input.cwd,
      ["--session", sessionId],
      sessionId,
    );
    return {
      nativeSessionId: process.nativeSessionId,
      checkpoint: piCheckpoint(process.nativeSessionId),
    };
  }
  async stop(): Promise<void> {
    if (this.stopped) return;
    if (!this.childStop) {
      this.stopped = true;
      return;
    }
    await this.childStop.stop();
    this.stopped = true;
  }
  private async start(
    cwd: string,
    args: string[],
    expectedId?: string,
  ): Promise<PiRpcProcess> {
    if (this.child || this.stopped)
      throw new Error("EXECUTION_ALREADY_STARTED");
    const child = this.provider.launch(
      this.executable,
      ["--mode", "rpc", ...args],
      cwd,
    );
    this.child = child;
    this.childStop = new ChildStop(child, this.terminate);
    try {
      return await startPiProcess(child, expectedId, this.readinessTimeoutMs);
    } catch {
      await this.stop();
      throw new Error("PI_STARTUP_FAILED");
    }
  }
  private rejectOptions(options: JsonValue | undefined): void {
    if (options !== undefined) throw new Error("UNSUPPORTED_OPTIONS");
  }
}
