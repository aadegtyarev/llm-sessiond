import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { decodePiRpcChunk } from "./pi-durable-rpc-decoder.js";
import { PiDurableRpcPending } from "./pi-durable-rpc-pending.js";

export class PiDurableRpcLink extends EventEmitter {
  private buffer = "";
  private dead = false;
  private readonly pending = new PiDurableRpcPending();
  constructor(private readonly child: ChildProcess) {
    super();
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", this.onData);
    child.stdout?.on("end", this.onTerminal);
    child.stdout?.on("error", this.onTerminal);
    child.stdout?.on("close", this.onTerminal);
    child.stdin?.on("error", this.onTerminal);
    child.on("exit", this.onTerminal);
    child.on("error", this.onTerminal);
    child.on("close", this.onTerminal);
  }
  private readonly onData = (chunk: string): void => this.consume(chunk);
  private readonly onTerminal = (): void => this.fail();
  get writable(): boolean {
    return !this.dead && Boolean(this.child.stdin?.writable);
  }
  command(
    command: string,
    args: Record<string, unknown>,
    timeoutMs = 15_000,
    beforeWrite?: () => boolean | void,
  ) {
    const stdin = this.child.stdin;
    const write = stdin?.write;
    if (this.dead || !stdin?.writable || !write)
      return Promise.reject(new Error("RPC_UNAVAILABLE"));
    const request = this.pending.begin(command, timeoutMs);
    let writeInvoked = false;
    try {
      const chunk = `${JSON.stringify({ type: command, id: request.id, ...args })}\n`;
      if (beforeWrite?.() === false || this.dead) {
        this.pending.abandon(request.id);
        return request.promise;
      }
      writeInvoked = true;
      Reflect.apply(write, stdin, [
        chunk,
        (error: Error | null | undefined) => error && this.fail(),
      ]);
    } catch {
      if (beforeWrite && !writeInvoked) {
        this.pending.abandon(request.id);
        return request.promise;
      }
      this.fail();
    }
    return request.promise;
  }
  closeAdmission(): void {
    this.fail();
  }
  dispose(): void {
    this.fail();
    this.child.stdout?.off("data", this.onData);
    this.child.stdout?.off("end", this.onTerminal);
    this.child.stdout?.off("error", this.onTerminal);
    this.child.stdout?.off("close", this.onTerminal);
    this.child.stdin?.off("error", this.onTerminal);
    this.child.off("exit", this.onTerminal);
    this.child.off("error", this.onTerminal);
    this.child.off("close", this.onTerminal);
    this.removeAllListeners();
  }
  private consume(chunk: string): void {
    if (this.dead) return;
    const decoded = decodePiRpcChunk(this.buffer, chunk);
    this.buffer = decoded.buffer;
    if (decoded.malformed) {
      this.fail();
      return;
    }
    for (const record of decoded.records) {
      if (this.dead) break;
      if (record.type === "response") this.response(record);
      else this.emit("event", record);
    }
  }
  private response(record: Record<string, unknown>): void {
    if (!this.pending.receive(record)) this.fail();
  }
  private fail(): void {
    if (this.dead) return;
    this.dead = true;
    this.pending.fail();
    this.emit("terminal");
  }
}
