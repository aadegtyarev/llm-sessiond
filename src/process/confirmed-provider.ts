import type { ChildProcess } from "node:child_process";
import type { ProcessProvider } from "../core/ports.js";

export class ConfirmedProcessProvider implements ProcessProvider {
  private readonly children = new Set<ChildProcess>();
  private readonly exited = new WeakSet<ChildProcess>();
  private stopping = false;
  constructor(
    private readonly provider: ProcessProvider,
    private readonly graceMs = 1000,
  ) {}
  launch(executable: string, args: string[], cwd: string): ChildProcess {
    if (this.stopping) throw new Error("PROCESS_PROVIDER_STOPPING");
    const child = this.provider.launch(executable, args, cwd);
    this.children.add(child);
    const markExited = (): void => {
      this.exited.add(child);
      this.children.delete(child);
    };
    child.once("exit", markExited);
    child.once("close", markExited);
    return child;
  }
  async shutdown(): Promise<void> {
    this.stopping = true;
    const outcomes = await Promise.allSettled(
      [...this.children].map(async (child) => {
        await stopAndConfirm(child, this.graceMs, () => this.exited.has(child));
        this.exited.add(child);
        this.children.delete(child);
      }),
    );
    if (outcomes.some((outcome) => outcome.status === "rejected"))
      throw new Error("PROCESS_SHUTDOWN_UNCONFIRMED");
    try {
      await this.provider.shutdown?.();
    } catch {
      throw new Error("PROCESS_SHUTDOWN_UNCONFIRMED");
    }
  }
}
function exited(child: ChildProcess, marked: () => boolean): boolean {
  return marked() || child.exitCode !== null || child.signalCode !== null;
}
async function stopAndConfirm(
  child: ChildProcess,
  graceMs: number,
  marked: () => boolean,
): Promise<void> {
  if (!exited(child, marked)) {
    try {
      child.kill("SIGTERM");
    } catch {}
  }
  if (!(await waitForExit(child, graceMs, marked))) {
    try {
      child.kill("SIGKILL");
    } catch {}
    if (!(await waitForExit(child, graceMs, marked)))
      throw new Error("PROCESS_SHUTDOWN_UNCONFIRMED");
  }
}
function waitForExit(
  child: ChildProcess,
  timeoutMs: number,
  marked: () => boolean,
): Promise<boolean> {
  if (exited(child, marked)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const finish = (value: boolean): void => {
      clearTimeout(timer);
      child.removeListener("exit", onExit);
      child.removeListener("close", onExit);
      resolve(value);
    };
    const onExit = (): void => finish(true);
    const timer = setTimeout(() => finish(exited(child, marked)), timeoutMs);
    child.once("exit", onExit);
    child.once("close", onExit);
  });
}
