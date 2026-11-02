import type { ChildProcess } from "node:child_process";
import type { Writable } from "node:stream";
import { ClaudeJsonlDecoder } from "./claude-jsonl-decoder.js";
import {
  isClaudeInitializeAck,
  validateClaudeLifetimeRecord,
} from "./claude-lifecycle-protocol.js";

export type ClaudeLifetimeTerminal =
  | "stream_error"
  | "stdin_error"
  | "process_exit"
  | "stdout_end"
  | "stdout_close"
  | "readiness_timeout"
  | "protocol_error";

export interface ClaudeLifetimeHooks {
  onRecord?: (line: string) => void;
  onTerminal?: (reason: ClaudeLifetimeTerminal) => void;
}

export function writeClaudeInitialize(
  stdin: Writable,
  requestId: string,
  failed: () => void,
): void {
  stdin.write(
    `${JSON.stringify({ type: "control_request", request_id: requestId, request: { subtype: "initialize", hooks: null } })}\n`,
    (error) => {
      if (error) failed();
    },
  );
}

export function removeClaudeStartupListeners(
  child: ChildProcess,
  listeners: {
    data: (chunk: Buffer) => void;
    end: () => void;
    streamError: () => void;
    stdinError: () => void;
    exit: () => void;
  },
): void {
  child.stdout?.removeListener("data", listeners.data);
  child.stdout?.removeListener("end", listeners.end);
  child.stdout?.removeListener("error", listeners.streamError);
  child.stdin?.removeListener("error", listeners.stdinError);
  child.removeListener("error", listeners.streamError);
  child.removeListener("exit", listeners.exit);
}

export class ClaudeLifetimeDispatch {
  private readonly decoder = new ClaudeJsonlDecoder();
  private ready = false;
  private terminalNotified = false;
  constructor(
    private readonly expectedId: string,
    private readonly requestId: string,
    private readonly hooks: ClaudeLifetimeHooks,
  ) {}
  push(chunk: Buffer): boolean {
    for (const line of this.decoder.push(chunk)) {
      if (!this.ready) {
        if (!isClaudeInitializeAck(line, this.expectedId, this.requestId))
          continue;
        this.ready = true;
        continue;
      }
      validateClaudeLifetimeRecord(line, this.expectedId);
      try {
        this.hooks.onRecord?.(line);
      } catch {}
    }
    return this.ready;
  }
  finish(): void {
    this.decoder.finish();
  }
  get initialized(): boolean {
    return this.ready;
  }
  get isTerminal(): boolean {
    return this.terminalNotified;
  }
  terminalOnce(reason: ClaudeLifetimeTerminal): void {
    if (this.terminalNotified) return;
    this.terminalNotified = true;
    try {
      this.hooks.onTerminal?.(reason);
    } catch {}
  }
}
