import type { HarnessEvent, InputState } from "../interfaces/runtime-ports.js";
import type { RuntimeState } from "./runtime-state.js";
import { current } from "./store-access.js";
import { nextSource, save } from "./runtime-support.js";
import { publish, setInput } from "./runtime-events.js";

const FAILURE_REASONS = [
  "prompt_rejected",
  "hold_timeout",
  "held_and_stopped",
  "canceled",
] as const;

export function onHarnessEvent(
  state: RuntimeState,
  event: HarnessEvent,
  epoch: number,
): void {
  try {
    const id = event.sessionId;
    if (
      !current(state) ||
      state.closing ||
      state.stopping.has(id) ||
      state.sources.get(id) !== epoch
    )
      return;
    const session = state.sessions.get(id);
    if (!session) return;
    if (event.kind === "ended") {
      nextSource(state, id);
      const active = state.inputs.get(id);
      if (active) setInput(state, id, active.inputId, "uncertain");
      try {
        save(state, { ...session, status: "uncertain" });
      } catch {
        return;
      }
      return;
    }
    if (event.kind === "output") {
      if (session.status === "running" && typeof event.text === "string")
        publish(state, { kind: "output", sessionId: id, text: event.text });
      return;
    }
    if (event.kind === "activity") {
      if (session.status === "running")
        publish(state, {
          kind: "activity",
          sessionId: id,
          activity: event.activity,
        });
      return;
    }
    if (event.kind === "notification") {
      if (session.status === "running" && typeof event.text === "string")
        publish(state, {
          kind: "notification",
          sessionId: id,
          text: event.text,
        });
      return;
    }
    const active: InputState | undefined = state.inputs.get(id);
    if (!active || active.inputId !== event.inputId) return;
    const canceled = state.cancelAccepted.delete(id);
    const reason = canceled
      ? "canceled"
      : event.kind === "failed" &&
          FAILURE_REASONS.includes(
            event.reason as (typeof FAILURE_REASONS)[number],
          )
        ? event.reason
        : undefined;
    setInput(
      state,
      id,
      event.inputId,
      event.kind === "failed" || canceled ? "failed" : "completed",
      reason,
    );
  } catch {
    return;
  }
}
