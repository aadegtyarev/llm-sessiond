import type { ChildProcess } from "node:child_process";
import type { ProcessProvider } from "../core/ports.js";
import { ChildStop, type ChildTerminator } from "../process/child-stop.js";
import { terminateChild } from "../process/terminate-child.js";
import { initializeClaude } from "./claude-lifecycle-startup.js";

export class ClaudeLifecycleProcess {
  private child?: ChildProcess;
  private childStop?: ChildStop;
  private stopped = false;
  constructor(
    private readonly provider: ProcessProvider,
    private readonly executable: string,
    private readonly readinessTimeoutMs: number,
    private readonly terminate?: ChildTerminator,
  ) {}
  async start(cwd: string, args: string[], expectedId: string): Promise<void> {
    if (this.child || this.stopped)
      throw new Error("EXECUTION_ALREADY_STARTED");
    const child = this.provider.launch(
      this.executable,
      [
        "--print",
        "--input-format",
        "stream-json",
        "--output-format",
        "stream-json",
        "--verbose",
        ...args,
      ],
      cwd,
    );
    this.child = child;
    child.on("error", () => {});
    this.childStop = new ChildStop(child, async (target) => {
      await (this.terminate ?? terminateChild)(target);
      if (target.exitCode === null && target.signalCode === null)
        throw new Error("CLAUDE_STOP_UNCONFIRMED");
    });
    try {
      await initializeClaude(child, expectedId, this.readinessTimeoutMs);
      if (child.exitCode !== null || child.signalCode !== null)
        throw new Error("CLAUDE_STARTUP_FAILED");
      child.stdout?.on("data", () => {});
    } catch {
      await this.stop();
      throw new Error("CLAUDE_STARTUP_FAILED");
    }
  }
  async stop(): Promise<void> {
    if (this.stopped) return;
    if (this.childStop) await this.childStop.stop();
    if (
      this.child &&
      this.child.exitCode === null &&
      this.child.signalCode === null
    )
      throw new Error("CLAUDE_STOP_UNCONFIRMED");
    this.stopped = true;
  }
}
