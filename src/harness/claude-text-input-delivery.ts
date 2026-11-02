import type { InputCommandOutcome } from "../core/execution-input-port.js";
import { claudeUserWire } from "./claude-text-input-protocol.js";
import {
  ClaudeTextInputDeliveryRecords,
  type ClaudeDeliveryRecord,
} from "./claude-text-input-delivery-records.js";
import { ClaudeTextInputDeliveryFence } from "./claude-text-input-delivery-fence.js";
import type {
  ClaudeInputEvent,
  ClaudeTextWriter,
} from "./claude-text-input-types.js";
export class ClaudeTextInputDelivery {
  private timer?: ReturnType<typeof setTimeout>;
  private readonly records: ClaudeTextInputDeliveryRecords;
  private readonly fence: ClaudeTextInputDeliveryFence;
  private written = false;
  constructor(
    private readonly id: string,
    private readonly text: string,
    sessionId: string,
    private readonly writer: ClaudeTextWriter,
    private readonly timeoutMs: number,
    private readonly emit: (event: ClaudeInputEvent) => void,
    private readonly clearCurrent: () => void,
    private readonly failClosed: () => void,
  ) {
    this.records = new ClaudeTextInputDeliveryRecords(sessionId, text);
    this.fence = new ClaudeTextInputDeliveryFence(() =>
      clearTimeout(this.timer),
    );
  }
  start(): Promise<InputCommandOutcome> {
    const wire = claudeUserWire(this.text);
    if (!wire)
      return Promise.resolve({ kind: "rejected", reason: "prompt_rejected" });
    return new Promise((resolve) => {
      this.fence.setResolver(resolve);
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
    if (this.fence.fenced) return "ignore";
    const record = this.records.record(line);
    if (record === "ack") this.acceptIfConfirmed();
    else if (record === "success" || record === "failure") this.settleIfReady();
    return record;
  }
  stopIntent(): void {
    this.fence.stopIntent(this.id, this.emit);
  }
  terminal(): void {
    this.fence.terminal(this.id, this.emit);
    this.clearCurrent();
  }
  private writeCompleted(error?: Error | null): void {
    if (this.fence.fenced) return;
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
    if (
      !this.records.ack ||
      !this.written ||
      this.fence.fenced ||
      this.fence.accepted
    )
      return;
    this.fence.accept(this.id, this.emit);
  }
  private settleIfReady(): void {
    if (!this.records.outcome || !this.fence.accepted || this.fence.fenced)
      return;
    this.fence.fence();
    this.clearCurrent();
    this.emit({
      inputId: this.id,
      state: this.records.outcome === "success" ? "completed" : "failed",
    });
  }
  private uncertain(): void {
    this.fence.uncertain(this.id, this.emit);
  }
}
