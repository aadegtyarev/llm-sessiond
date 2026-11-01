import type { ChildProcess } from "node:child_process";
import type { ProcessProvider } from "../core/ports.js";
import type {
  LifecycleExecution,
  LifecycleLaunchResult,
} from "../core/lifecycle-execution.js";
import type { AdapterCheckpoint } from "../core/adapter-contracts.js";
import { piCheckpoint, PiLifecycleAdapter } from "./pi-lifecycle-adapter.js";
import { startPiProcess } from "./pi-startup.js";
import type { PiRpcProcess } from "./pi-process.js";
import { terminateChild } from "../process/terminate-child.js";
export class PiLifecycleExecution implements LifecycleExecution {
  private child?: ChildProcess;
  private rpcProcess?: PiRpcProcess;
  private started = false;
  private stopped = false;
  constructor(
    private readonly adapter: PiLifecycleAdapter,
    private readonly provider: ProcessProvider,
    private readonly executable: string,
  ) {}
  async launch(input: {
    cwd: string;
    options?: import("../core/generic-json.js").JsonValue;
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
    options?: import("../core/generic-json.js").JsonValue;
    checkpoint?: AdapterCheckpoint;
    nativeSessionId?: string;
  }): Promise<LifecycleLaunchResult> {
    this.rejectOptions(input.options);
    const data = input.checkpoint?.data;
    if (
      !input.checkpoint ||
      input.checkpoint.namespace !== this.adapter.checkpoint.namespace ||
      input.checkpoint.version !== this.adapter.checkpoint.version ||
      !this.adapter.validateCheckpoint(input.checkpoint.data)
    )
      throw new Error("INVALID_CHECKPOINT");
    const sessionId = (data as { sessionId?: unknown }).sessionId;
    if (
      typeof sessionId !== "string" ||
      !sessionId ||
      (input.nativeSessionId !== undefined &&
        input.nativeSessionId !== sessionId)
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
    this.stopped = true;
    if (this.rpcProcess) await this.rpcProcess.stop();
    else if (this.child) await terminateChild(this.child);
  }
  private async start(
    cwd: string,
    args: string[],
    expectedId?: string,
  ): Promise<PiRpcProcess> {
    if (this.started || this.stopped)
      throw new Error("EXECUTION_ALREADY_STARTED");
    this.started = true;
    const child = this.provider.launch(
      this.executable,
      ["--mode", "rpc", ...args],
      cwd,
    );
    this.child = child;
    try {
      this.rpcProcess = await startPiProcess(child, expectedId);
      return this.rpcProcess;
    } catch {
      await this.stop();
      throw new Error("PI_STARTUP_FAILED");
    }
  }
  private rejectOptions(
    options: import("../core/generic-json.js").JsonValue | undefined,
  ): void {
    if (options !== undefined) throw new Error("UNSUPPORTED_OPTIONS");
  }
}
