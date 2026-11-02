import type { InputImage } from "./input-validation.js";

export type InputFailureReason =
  "prompt_rejected" | "hold_timeout" | "held_and_stopped" | "canceled";
export type InputCommandOutcome =
  | { kind: "accepted" }
  | { kind: "rejected"; reason: InputFailureReason }
  | { kind: "uncertain" };
export type InputCancelOutcome =
  { kind: "accepted" } | { kind: "rejected" } | { kind: "uncertain" };
export type ExecutionInputEvent =
  | {
      inputId: string;
      state: "accepted" | "completed" | "failed" | "uncertain";
      reason?: InputFailureReason;
    }
  | { kind: "execution-ended" };
export interface ExecutionInputPort {
  submit(input: {
    inputId: string;
    text: string;
    images?: InputImage[];
  }): Promise<InputCommandOutcome>;
  cancel(inputId: string): Promise<InputCancelOutcome>;
  subscribe(listener: (event: unknown) => void): () => void;
}
