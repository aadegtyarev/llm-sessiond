import type { ChildProcess } from "node:child_process";
import type { ProcessProvider } from "../core/ports.js";
import type { ChildTerminator } from "../process/child-stop.js";
import { terminateChild } from "../process/terminate-child.js";
import { PiDurableRpcLink } from "./pi-durable-rpc-link.js";
import { PiDurableInputPort } from "./pi-durable-input-port.js";
import { startDurablePi } from "./pi-durable-startup.js";
import { projectPiLiveStatus } from "./pi-live-status.js";

export class PiDurableProcess {
  readonly inputs = new PiDurableInputPort();
  private child?: ChildProcess;
  private stopped = false;
  private stopRequested = false;
  private nativeSessionId: string | undefined;
  private link?: PiDurableRpcLink;
  private stopping: Promise<void> | undefined;
  constructor(
    private readonly provider: ProcessProvider,
    private readonly executable: string,
    private readonly readinessTimeoutMs: number,
    private readonly terminate?: ChildTerminator,
  ) {}
  async start(
    cwd: string,
    args: string[],
    expectedId?: string,
  ): Promise<string> {
    if (this.child || this.stopped || this.stopRequested)
      throw new Error("EXECUTION_ALREADY_STARTED");
    const child = this.provider.launch(
      this.executable,
      ["--mode", "rpc", ...args],
      cwd,
    );
    this.child = child;
    const link = new PiDurableRpcLink(child);
    this.link = link;
    this.inputs.attach(link);
    try {
      const nativeSessionId = await startDurablePi(
        link,
        expectedId,
        this.readinessTimeoutMs,
      );
      this.nativeSessionId = nativeSessionId;
      return nativeSessionId;
    } catch {
      try {
        await this.stop();
      } catch {
        /* Ownership remains until a confirmed retry. */
      }
      throw new Error("PI_STARTUP_FAILED");
    }
  }
  async readLiveStatus() {
    const link = this.link;
    if (!link || this.stopRequested || this.stopped || !link.writable)
      throw new Error("RPC_UNAVAILABLE");
    const [stateReply, statsReply] = await Promise.all([
      link.command("get_state", {}),
      link.command("get_session_stats", {}),
    ]);
    if (this.link !== link || this.stopRequested || this.stopped)
      throw new Error("RPC_UNAVAILABLE");
    const state = this.controlData(stateReply);
    const stats = this.controlData(statsReply);
    if (state.sessionId !== this.nativeSessionId)
      throw new Error("INVALID_LIVE_STATUS");
    return projectPiLiveStatus(state, stats);
  }
  private controlData(reply: Record<string, unknown>): Record<string, unknown> {
    const data = reply.data;
    if (
      reply.success !== true ||
      typeof data !== "object" ||
      data === null ||
      Array.isArray(data)
    )
      throw new Error("INVALID_LIVE_STATUS");
    return data as Record<string, unknown>;
  }
  stop(): Promise<void> {
    this.stopRequested = true;
    this.inputs.end();
    this.link?.closeAdmission();
    if (this.stopped) return Promise.resolve();
    const child = this.child;
    if (!child) {
      this.stopped = true;
      return Promise.resolve();
    }
    if (this.stopping) return this.stopping;
    return this.stopOwnedChild(child);
  }
  private async stopOwnedChild(child: ChildProcess): Promise<void> {
    const attempt = this.stopChild(child);
    this.stopping = attempt;
    try {
      await attempt;
      this.stopped = true;
    } catch (error) {
      if (this.stopping === attempt) this.stopping = undefined;
      throw error;
    }
  }
  private async stopChild(child: ChildProcess): Promise<void> {
    await (this.terminate ?? terminateChild)(child);
    if (child.exitCode === null && child.signalCode === null)
      throw new Error("STOP_UNCONFIRMED");
    this.link?.dispose();
  }
}
