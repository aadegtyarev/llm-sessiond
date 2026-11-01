import type {
  ExecutionInputPort,
  InputCommandOutcome,
} from "../core/execution-input-port.js";
import type { InputImage } from "../core/input-validation.js";
import type { PiDurableRpcLink } from "./pi-durable-rpc-link.js";
import { PiDurableInputEvents } from "./pi-durable-input-events.js";
export class PiDurableInputPort implements ExecutionInputPort {
  private readonly events = new PiDurableInputEvents();
  private active: { id: string } | undefined;
  private dead = false;
  private completionTimer: NodeJS.Timeout | undefined;
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
    if (this.completionTimer) clearTimeout(this.completionTimer);
    this.completionTimer = undefined;
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
    if (input.images?.length) throw new Error("UNSUPPORTED_CAPABILITY");
    const link = this.link;
    if (this.dead || !link?.writable) return { kind: "uncertain" };
    if (this.active) return { kind: "uncertain" };
    const current = { id: input.inputId };
    this.active = current;
    try {
      const reply = await link.command("prompt", {
        message: input.text,
        streamingBehavior: "steer",
      });
      if (reply.success !== true) {
        if (this.dead) return { kind: "uncertain" };
        if (this.active === current) {
          if (this.completionTimer) clearTimeout(this.completionTimer);
          this.completionTimer = undefined;
          this.active = undefined;
        }
        this.events.publish({
          inputId: input.inputId,
          state: "failed",
          reason: "prompt_rejected",
        });
        return { kind: "rejected", reason: "prompt_rejected" };
      }
      if (this.dead) return { kind: "uncertain" };
      return { kind: "accepted" };
    } catch {
      return { kind: "uncertain" };
    }
  }
  async cancel(inputId: string): Promise<InputCommandOutcome> {
    void inputId;
    throw new Error("UNSUPPORTED_CAPABILITY");
  }
  private onRecord(record: Record<string, unknown>): void {
    if (this.dead || record.type !== "agent_settled") return;
    const current = this.active;
    if (!current) return;
    this.scheduleComplete(current);
  }
  private scheduleComplete(
    current: NonNullable<PiDurableInputPort["active"]>,
  ): void {
    if (this.dead || this.active !== current || this.completionTimer) return;
    this.completionTimer = setTimeout(() => this.complete(current), 0);
  }
  private complete(current: NonNullable<PiDurableInputPort["active"]>): void {
    this.completionTimer = undefined;
    if (this.dead || this.active !== current) return;
    this.active = undefined;
    this.events.publish({ inputId: current.id, state: "completed" });
  }
}
