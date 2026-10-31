import type { ChildProcess } from "node:child_process";
import type { HarnessSession } from "../core/ports.js";
import { RpcLink } from "./rpc-link.js";
import { mapPiRecord } from "./pi-event-mapper.js";
import { terminateChild } from "../process/terminate-child.js";
import { PiInputController } from "./pi-input-controller.js";

export class PiRpcProcess implements HarnessSession {
  readonly nativeSessionId: string;
  readonly child: ChildProcess;
  private readonly link: RpcLink;
  private listeners: ((type: string, data: Record<string, unknown>) => void)[] =
    [];
  private readonly inputs: PiInputController;
  constructor(child: ChildProcess, nativeId: string) {
    this.child = child;
    this.nativeSessionId = nativeId;
    this.link = new RpcLink(child);
    this.inputs = new PiInputController(this.link, (type, data) =>
      this.emit(type, data),
    );
    this.link.on("event", (record: Record<string, unknown>) =>
      this.event(record),
    );
    this.link.on("malformed", () =>
      this.emit("session.error", { code: "PI_MALFORMED_JSON" }),
    );
  }
  onEvent(
    listener: (type: string, data: Record<string, unknown>) => void,
  ): void {
    this.listeners.push(listener);
  }
  submit(
    text: string,
    images?: import("../core/types.js").ImageInput[],
  ): Promise<string> {
    return this.inputs.submit(text, images);
  }
  isInputActive(inputId: string): boolean {
    return this.inputs.isActive(inputId);
  }
  acceptInput(inputId: string): void {
    this.inputs.acceptInput(inputId);
  }
  cancel(inputId: string): Promise<void> {
    return this.inputs.cancel(inputId);
  }
  stop(): Promise<void> {
    return terminateChild(this.child);
  }
  private emit(type: string, data: Record<string, unknown>): void {
    for (const listener of this.listeners) listener(type, data);
  }
  private event(record: Record<string, unknown>): void {
    for (const event of mapPiRecord(record)) this.emit(event.type, event.data);
    if (record.type === "agent_settled") this.inputs.onAgentSettled();
  }
}
