import type {
  ExecutionInputPort,
  InputCommandOutcome,
} from "../core/execution-input-port.js";
import type { InputImage } from "../core/input-validation.js";
import type { PiDurableRpcLink } from "./pi-durable-rpc-link.js";
import type { PiDurableInputEvent } from "./pi-durable-input-event.js";
export class PiDurableInputPort implements ExecutionInputPort {
  private readonly listeners = new Set<(event: unknown) => void>();
  private active:
    | { id: string; accepted: boolean; settled: boolean; uncertain: boolean }
    | undefined;
  private dead = false;
  private completionTimer: NodeJS.Timeout | undefined;
  private link?: PiDurableRpcLink;
  attach(link: PiDurableRpcLink): void {
    this.link = link;
    link.on("event", (record: Record<string, unknown>) =>
      this.onRecord(record),
    );
    link.on("terminal", () => {
      this.dead = true;
      if (this.completionTimer) clearTimeout(this.completionTimer);
      this.completionTimer = undefined;
      this.publish({ kind: "execution-ended" });
    });
  }
  subscribe(listener: (event: unknown) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  async submit(input: {
    inputId: string;
    text: string;
    images?: InputImage[];
  }): Promise<InputCommandOutcome> {
    if (input.images?.length)
      return { kind: "rejected", reason: "prompt_rejected" };
    const link = this.link;
    if (this.dead || !link?.writable) return { kind: "uncertain" };
    if (this.active) return { kind: "uncertain" };
    const current = {
      id: input.inputId,
      accepted: false,
      settled: false,
      uncertain: false,
    };
    this.active = current;
    try {
      const reply = await link.command("prompt", {
        message: input.text,
        streamingBehavior: "steer",
      });
      if (reply.success !== true) {
        if (this.active === current) this.active = undefined;
        this.publish({
          inputId: input.inputId,
          state: "failed",
          reason: "prompt_rejected",
        });
        return { kind: "rejected", reason: "prompt_rejected" };
      }
      current.accepted = true;
      if (current.settled && !current.uncertain) this.scheduleComplete(current);
      return { kind: "accepted" };
    } catch {
      current.uncertain = true;
      return { kind: "uncertain" };
    }
  }
  async cancel(inputId: string): Promise<InputCommandOutcome> {
    void inputId;
    throw new Error("UNSUPPORTED_CAPABILITY");
  }
  private onRecord(record: Record<string, unknown>): void {
    if (record.type !== "agent_settled") return;
    const current = this.active;
    if (!current) return;
    current.settled = true;
    if (current.accepted && !current.uncertain) this.scheduleComplete(current);
  }
  private scheduleComplete(
    current: NonNullable<PiDurableInputPort["active"]>,
  ): void {
    this.completionTimer = setTimeout(() => this.complete(current), 0);
  }
  private complete(current: NonNullable<PiDurableInputPort["active"]>): void {
    this.completionTimer = undefined;
    if (this.active !== current) return;
    this.active = undefined;
    this.publish({ inputId: current.id, state: "completed" });
  }
  private publish(
    event: PiDurableInputEvent | { kind: "execution-ended" },
  ): void {
    for (const listener of this.listeners) listener(event);
  }
}
