import type { InputCommandOutcome } from "../core/execution-input-port.js";
import { classifyClaudeInputRecord } from "./claude-text-input-protocol.js";
import type {
  ClaudeInputEvent,
  ClaudeTextWriter,
} from "./claude-text-input-types.js";
type ClaudeDeliveryRecord =
  ReturnType<typeof classifyClaudeInputRecord> | "out-of-order";

const MAX_RECORD_BYTES = 1024 * 1024;
export class ClaudeTextInputDelivery {
  private resolve?: (outcome: InputCommandOutcome) => void;
  private timer?: ReturnType<typeof setTimeout>;
  private ack = false;
  private written = false;
  private accepted = false;
  private finished = false;
  private outcome?: "success" | "failure";
  constructor(
    private readonly id: string,
    private readonly text: string,
    private readonly sessionId: string,
    private readonly writer: ClaudeTextWriter,
    private readonly timeoutMs: number,
    private readonly emit: (event: ClaudeInputEvent) => void,
    private readonly clearCurrent: () => void,
    private readonly failClosed: () => void,
  ) {}
  start(): Promise<InputCommandOutcome> {
    const wire = `${JSON.stringify({ type: "user", message: { role: "user", content: this.text } })}\n`;
    if (Buffer.byteLength(wire) > MAX_RECORD_BYTES)
      return Promise.resolve({ kind: "rejected", reason: "prompt_rejected" });
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.timer = setTimeout(() => this.uncertain(), this.timeoutMs);
      try {
        this.writer(wire, (error) => this.writeCompleted(error));
      } catch {
        this.uncertain();
        this.failClosed();
      }
    });
  }
  record(line: string): ClaudeDeliveryRecord {
    const record = classifyClaudeInputRecord(line, this.sessionId, this.text);
    if (record === "ack") {
      this.ack = true;
      this.acceptIfConfirmed();
    } else if (record === "success" || record === "failure") {
      if (!this.ack) return "out-of-order";
      this.outcome = record;
      this.settleIfReady();
    }
    return record;
  }
  stopIntent(): void {
    if (this.accepted) this.emit({ inputId: this.id, state: "uncertain" });
    else if (!this.finished) this.uncertain();
  }
  terminal(): void {
    if (!this.finished) this.uncertain();
    this.clearCurrent();
  }
  private writeCompleted(error?: Error | null): void {
    if (this.finished) return;
    if (error) {
      this.uncertain();
      this.failClosed();
      return;
    }
    this.written = true;
    this.acceptIfConfirmed();
    this.settleIfReady();
  }
  private acceptIfConfirmed(): void {
    if (!this.ack || !this.written || this.finished) return;
    this.finished = this.accepted = true;
    clearTimeout(this.timer);
    this.resolve?.({ kind: "accepted" });
    this.emit({ inputId: this.id, state: "accepted" });
  }
  private settleIfReady(): void {
    if (!this.outcome || !this.ack || !this.written) return;
    if (!this.finished) this.acceptIfConfirmed();
    this.clearCurrent();
    this.emit({
      inputId: this.id,
      state: this.outcome === "success" ? "completed" : "failed",
    });
  }
  private uncertain(): void {
    if (this.finished) return;
    this.finished = true;
    clearTimeout(this.timer);
    this.resolve?.({ kind: "uncertain" });
    this.emit({ inputId: this.id, state: "uncertain" });
  }
}
