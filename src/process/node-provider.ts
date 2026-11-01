import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import type { ProcessProvider } from "../core/ports.js";
import { terminateChild } from "./terminate-child.js";

export class NodeProcessProvider implements ProcessProvider {
  private readonly children = new Set<ChildProcess>();
  private stopping = false;
  launch(executable: string, args: string[], cwd: string): ChildProcess {
    if (this.stopping) throw new Error("PROCESS_PROVIDER_STOPPING");
    const child = spawn(executable, args, {
      cwd,
      shell: false,
      stdio: ["pipe", "pipe", "ignore"],
    });
    this.children.add(child);
    child.once("close", () => this.children.delete(child));
    return child;
  }
  async shutdown(): Promise<void> {
    this.stopping = true;
    await Promise.all([...this.children].map((child) => terminateChild(child)));
    this.children.clear();
  }
}
