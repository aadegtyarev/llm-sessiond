import type { ActivityEvent } from "./runtime-activity-data.js";

export type HarnessEvent =
  | { kind: "output"; sessionId: string; text: string }
  | { kind: "settled"; sessionId: string; inputId: string }
  | {
      kind: "failed";
      sessionId: string;
      inputId: string;
      reason?:
        "prompt_rejected" | "hold_timeout" | "held_and_stopped" | "canceled";
    }
  | { kind: "activity"; sessionId: string; activity: ActivityEvent }
  | { kind: "notification"; sessionId: string; text: string }
  | { kind: "ended"; sessionId: string };
