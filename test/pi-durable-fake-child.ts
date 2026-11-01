import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";

class FakePipe extends EventEmitter {
  writable = true;
  setEncoding(): this {
    return this;
  }
  write?: (chunk: string, callback?: (error?: Error | null) => void) => boolean;
}
export class FakePiChild extends EventEmitter {
  readonly stdout = new FakePipe();
  readonly stdin = new FakePipe();
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  readonly writes: Record<string, unknown>[] = [];
  readonly child = this as unknown as ChildProcess;
  onWrite: ((request: Record<string, unknown>) => void) | undefined;
  constructor() {
    super();
    this.stdin.write = (line, callback) => {
      const request = JSON.parse(line) as Record<string, unknown>;
      this.writes.push(request);
      this.onWrite?.(request);
      callback?.();
      return true;
    };
    this.onWrite = (request) => {
      if (request.type === "get_state")
        this.send({
          type: "response",
          id: request.id,
          command: "get_state",
          success: true,
          data: { sessionId: "native-test" },
        });
    };
  }
  send(record: Record<string, unknown>): void {
    this.stdout.emit("data", `${JSON.stringify(record)}\n`);
  }
  kill(): boolean {
    this.confirmExit();
    return true;
  }
  confirmExit(): void {
    this.exitCode = 0;
    this.stdin.writable = false;
    this.stdout.emit("end");
    this.emit("exit", 0, null);
    this.emit("close", 0, null);
  }
}
