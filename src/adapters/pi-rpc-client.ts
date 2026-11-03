import type { ChildProcess } from "node:child_process";
import { decodePiRpcChunk } from "../harness/pi-durable-rpc-decoder.js";
import { PiRpcPending } from "./pi-rpc-pending.js";
import { PiRpcObservers } from "./pi-rpc-observers.js";

export class PiRpcClient {
  private buffer = "";
  private dead = false;
  private readonly pending = new PiRpcPending();
  private readonly observers = new PiRpcObservers();
  constructor(
    readonly child: ChildProcess,
    private readonly defaultTimeoutMs = 15_000,
  ) {
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", this.onData);
    child.stdout?.on("end", this.fail);
    child.stdout?.on("error", this.onStreamError);
    child.stdin?.on("error", this.onStreamError);
    child.on("exit", this.fail);
    child.on("error", this.onStreamError);
  }
  get writable(): boolean {
    return !this.dead && Boolean(this.child.stdin?.writable);
  }
  subscribe(listener: (record: Record<string, unknown>) => void): () => void {
    return this.observers.subscribe(listener);
  }
  command(
    type: string,
    fields: Record<string, unknown> = {},
    timeoutMs = this.defaultTimeoutMs,
    beforeWrite?: () => boolean,
    onResponse?: (record: Record<string, unknown>) => void,
  ): Promise<Record<string, unknown>> {
    const stdin = this.child.stdin;
    const write = stdin?.write;
    if (this.dead || !stdin?.writable || typeof write !== "function")
      return Promise.reject(new Error("RPC unavailable"));
    const request = this.pending.begin(type, timeoutMs, onResponse);
    try {
      const line = `${JSON.stringify({ type, id: request.id, ...fields })}\n`;
      if (beforeWrite?.() === false || this.dead) {
        this.pending.abandon(request.id);
        return request.promise;
      }
      Reflect.apply(write, stdin, [
        line,
        (error: Error | null | undefined) => {
          if (error) this.fail();
        },
      ]);
    } catch {
      this.fail();
    }
    return request.promise;
  }
  close(): void {
    this.fail();
  }
  dispose(): void {
    this.fail();
    this.child.stdout?.off("data", this.onData);
    this.child.stdout?.off("end", this.fail);
    this.child.stdout?.off("error", this.onStreamError);
    this.child.stdin?.off("error", this.onStreamError);
    this.child.off("exit", this.fail);
    this.child.off("error", this.onStreamError);
    this.observers.clear();
  }
  private readonly onData = (chunk: string): void => {
    if (this.dead) return;
    const decoded = decodePiRpcChunk(this.buffer, chunk);
    this.buffer = decoded.buffer;
    if (decoded.malformed) {
      this.fail();
      return;
    }
    for (const record of decoded.records) {
      if (record.type === "response") {
        if (!this.pending.receive(record)) {
          this.fail();
          return;
        }
      } else this.observers.publish(record);
    }
  };
  private readonly onStreamError = (): void => this.fail();
  private readonly fail = (): void => {
    if (this.dead) return;
    this.dead = true;
    this.pending.fail();
    this.observers.publish({ type: "__terminal" });
  };
}
