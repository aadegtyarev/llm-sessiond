import type {
  ExecutionInputPort,
  InputCommandOutcome,
} from "../core/execution-input-port.js";
import type { InputImage } from "../core/input-validation.js";
import type { PiDurableRpcLink } from "./pi-durable-rpc-link.js";
import { PiDurableInputEvents } from "./pi-durable-input-events.js";
import { PiDurableInputCompletion } from "./pi-durable-input-completion.js";
import { submitPiCurrent } from "./pi-durable-input-submit.js";
import {
  cancelPiCurrent,
  type PiDurableCurrentInput,
} from "./pi-durable-input-cancel.js";
export class PiDurableInputPort implements ExecutionInputPort {
  private readonly events = new PiDurableInputEvents();
  private active: PiDurableCurrentInput | undefined;
  private dead = false;
  private readonly completion = new PiDurableInputCompletion();
  private link?: PiDurableRpcLink;
  attach(link: PiDurableRpcLink): void {
    this.link = link;
    link.on("event", (record: Record<string, unknown>) =>
      this.onRecord(record),
    );
    link.on("terminal", () => this.end());
  }
  end(): void {
    if (this.dead) return;
    this.dead = true;
    this.completion.clear();
    this.events.publish({ kind: "execution-ended" });
  }
  subscribe(listener: (event: unknown) => void): () => void {
    return this.events.subscribe(listener);
  }
  async submit(input: {
    inputId: string;
    text: string;
    images?: InputImage[];
  }): Promise<InputCommandOutcome> {
    const link = this.link;
    if (this.dead || !link?.writable) return { kind: "uncertain" };
    if (this.active) return { kind: "uncertain" };
    const current: PiDurableCurrentInput = {
      id: input.inputId,
      accepted: false,
      canceling: false,
      settled: false,
      abortAccepted: false,
      abortUncertain: false,
    };
    this.active = current;
    return submitPiCurrent(
      current,
      input,
      link,
      () => this.dead,
      () => this.active === current,
      () => {
        this.completion.clear();
        this.active = undefined;
      },
      (event) => this.events.publish(event),
    );
  }
  async cancel(inputId: string) {
    const current = this.active;
    return cancelPiCurrent(
      current,
      inputId,
      this.link,
      () => this.dead,
      () => current && this.scheduleComplete(current),
    );
  }
  private onRecord(record: Record<string, unknown>): void {
    if (this.dead || record.type !== "agent_settled") return;
    const current = this.active;
    if (!current) return;
    current.settled = true;
    if (!current.canceling) this.scheduleComplete(current);
  }
  private scheduleComplete(current: PiDurableCurrentInput): void {
    this.completion.schedule(
      current,
      this.dead,
      () => this.active === current,
      (event) => this.events.publish(event),
      () => {
        this.active = undefined;
      },
    );
  }
}
