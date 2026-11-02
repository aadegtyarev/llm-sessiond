import type {
  ExecutionInputPort,
  InputCommandOutcome,
} from "../core/execution-input-port.js";
import type { InputImage } from "../core/input-validation.js";
import { ClaudeTextInputDelivery } from "./claude-text-input-delivery.js";
import type { ClaudeTextWriter } from "./claude-text-input-types.js";
import { ClaudeTextInputEvents } from "./claude-text-input-events.js";

export class ClaudeTextInputController implements ExecutionInputPort {
  private sessionId?: string;
  private writer: ClaudeTextWriter | undefined;
  private closed = false;
  private ready = false;
  private active: ClaudeTextInputDelivery | undefined;
  private readonly events = new ClaudeTextInputEvents();
  private terminalAction?: () => void;
  constructor(private readonly ackTimeoutMs = 30_000) {}
  submit(input: {
    inputId: string;
    text: string;
    images?: InputImage[];
  }): Promise<InputCommandOutcome> {
    if (input.images !== undefined)
      return Promise.resolve({ kind: "rejected", reason: "prompt_rejected" });
    if (
      this.closed ||
      !this.ready ||
      !this.sessionId ||
      !this.writer ||
      this.active
    )
      return Promise.resolve({ kind: "uncertain" });
    const delivery = new ClaudeTextInputDelivery(
      input.inputId,
      input.text,
      this.sessionId,
      this.writer,
      this.ackTimeoutMs,
      (event) => this.events.publish(event),
      () => {
        if (this.active === delivery) this.active = undefined;
      },
      () => this.terminate(true),
    );
    this.active = delivery;
    return delivery.start().then((outcome) => {
      if (outcome.kind === "rejected" && this.active === delivery)
        this.active = undefined;
      return outcome;
    });
  }
  markReady(): void {
    this.ready = true;
  }
  bind(sessionId: string, writer: ClaudeTextWriter): void {
    if (this.closed || this.sessionId) throw new Error("CLAUDE_INPUT_CLOSED");
    this.sessionId = sessionId;
    this.writer = writer;
  }
  onRecord(line: string): void {
    if (this.closed || !this.active) return;
    const record = this.active.record(line);
    if (record === "invalid" || record === "out-of-order") this.terminate(true);
  }
  setTerminalAction(action: () => void): void {
    this.terminalAction = action;
  }
  stopIntent(): void {
    this.closed = true;
    this.writer = undefined;
    this.active?.stopIntent();
  }
  confirmStopped(): void {
    this.active?.terminal();
    this.active = undefined;
    this.writer = undefined;
  }
  terminate(failClosed = false): void {
    if (this.closed) return;
    this.closed = true;
    this.writer = undefined;
    this.active?.terminal();
    this.active = undefined;
    this.events.publish({ kind: "execution-ended" });
    if (failClosed) {
      try {
        this.terminalAction?.();
      } catch {}
    }
  }
  cancel(): Promise<{ kind: "rejected" }> {
    return Promise.resolve({ kind: "rejected" });
  }
  subscribe(listener: (event: unknown) => void): () => void {
    return this.events.subscribe(listener);
  }
}
