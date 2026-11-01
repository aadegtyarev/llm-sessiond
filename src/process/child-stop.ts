import type { ChildProcess } from "node:child_process";
import { terminateChild } from "./terminate-child.js";

export type ChildTerminator = (child: ChildProcess) => Promise<void>;
export class ChildStop {
  private completed = false;
  private pending: Promise<void> | undefined;
  constructor(
    private readonly child: ChildProcess,
    private readonly terminate: ChildTerminator = terminateChild,
  ) {}
  async stop(): Promise<void> {
    if (this.completed) return;
    if (this.pending) return this.pending;
    const attempt = this.terminate(this.child);
    this.pending = attempt;
    try {
      await attempt;
      this.completed = true;
    } catch (error) {
      if (this.pending === attempt) this.pending = undefined;
      throw error;
    }
  }
}
