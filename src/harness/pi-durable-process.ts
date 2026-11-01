import type { ChildProcess } from "node:child_process";
import type { ProcessProvider } from "../core/ports.js";
import type { ChildTerminator } from "../process/child-stop.js";
import { terminateChild } from "../process/terminate-child.js";
import { PiDurableRpcLink } from "./pi-durable-rpc-link.js";
import { PiDurableInputPort } from "./pi-durable-input-port.js";
import { startDurablePi } from "./pi-durable-startup.js";

export class PiDurableProcess {
  readonly inputs = new PiDurableInputPort();
  private child?: ChildProcess;
  private stopped = false;
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
    if (this.child || this.stopped)
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
      return await startDurablePi(link, expectedId, this.readinessTimeoutMs);
    } catch {
      try {
        await this.stop();
      } catch {
        /* Ownership remains until a confirmed retry. */
      }
      throw new Error("PI_STARTUP_FAILED");
    }
  }
  async stop(): Promise<void> {
    if (this.stopped) return;
    if (!this.child) {
      this.stopped = true;
      return;
    }
    if (this.stopping) return this.stopping;
    const attempt = this.stopChild(this.child);
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
