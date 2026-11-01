import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";

export class RpcLink extends EventEmitter {
  readonly pending = new Map<
    string,
    (record: Record<string, unknown>) => void
  >();
  private buffer = "";
  private readonly onData = (chunk: string): void => this.consume(chunk);
  private readonly onExit = (): void => this.failAll();
  constructor(readonly child: ChildProcess) {
    super();
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", this.onData);
    child.on("exit", this.onExit);
    child.on("error", this.onExit);
  }
  dispose(): void {
    this.child.stdout?.off("data", this.onData);
    this.child.off("exit", this.onExit);
    this.child.off("error", this.onExit);
    this.failAll();
    this.removeAllListeners();
  }
  command(
    command: string,
    args: Record<string, unknown> = {},
    timeout = 15_000,
  ): Promise<Record<string, unknown>> {
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("RPC_TIMEOUT"));
      }, timeout);
      this.pending.set(id, (record) => {
        clearTimeout(timer);
        this.pending.delete(id);
        if (record.command !== command || typeof record.success !== "boolean")
          reject(new Error("RPC_MALFORMED_RESPONSE"));
        else resolve(record);
      });
      const line = JSON.stringify({ type: command, id, ...args }) + "\n";
      this.child.stdin?.write(line, (error) => {
        if (error) {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(new Error("RPC_WRITE_UNCERTAIN"));
        }
      });
    });
  }
  private consume(chunk: string): void {
    this.buffer += chunk;
    if (
      Buffer.byteLength(this.buffer) > 1_048_576 &&
      !this.buffer.includes("\n")
    ) {
      this.buffer = "";
      this.emit("malformed");
      return;
    }
    let index: number;
    while ((index = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, index).replace(/\r$/, "");
      this.buffer = this.buffer.slice(index + 1);
      if (Buffer.byteLength(line) > 1_048_576) {
        this.emit("malformed");
        continue;
      }
      try {
        const record = JSON.parse(line) as Record<string, unknown>;
        if (record.type === "response" && typeof record.id === "string")
          this.pending.get(record.id)?.(record);
        else if (typeof record.type === "string") this.emit("event", record);
      } catch {
        this.emit("malformed");
      }
    }
  }
  private failAll(): void {
    for (const resolve of this.pending.values()) resolve({ success: false });
    this.pending.clear();
  }
}
