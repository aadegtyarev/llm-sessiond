import type { SubmitOutcome } from "../interfaces/runtime-ports.js";
import type { RuntimeState } from "./runtime-state.js";
import { holdUncertain, writeGuard } from "./runtime-support.js";
import { setInput } from "./runtime-events.js";

export function settleSubmission(
  state: RuntimeState,
  id: string,
  inputId: string,
  epoch: number,
  outcome: SubmitOutcome,
): { outcome?: "not-applied" | "unknown"; failure?: string } {
  if (!writeGuard(state, id, epoch)) {
    holdUncertain(state, id, inputId);
    return { outcome: "unknown" };
  }
  if (
    outcome.kind === "accepted" &&
    state.inputs.get(id)?.inputId === inputId &&
    state.inputs.get(id)?.state === "pending"
  )
    setInput(state, id, inputId, "accepted");
  else if (
    outcome.kind === "rejected" &&
    state.inputs.get(id)?.inputId === inputId
  )
    setInput(state, id, inputId, "failed", outcome.reason);
  else if (
    outcome.kind === "uncertain" &&
    state.inputs.get(id)?.inputId === inputId
  )
    setInput(state, id, inputId, "uncertain");
  return {
    ...(outcome.kind === "accepted"
      ? {}
      : {
          outcome:
            outcome.kind === "rejected"
              ? ("not-applied" as const)
              : ("unknown" as const),
        }),
    ...(outcome.kind === "rejected" ? { failure: outcome.reason } : {}),
  };
}
