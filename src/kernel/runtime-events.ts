import type {
  InputState,
  SessionEvent,
  SessionRecord,
} from "../interfaces/runtime-ports.js";
import type { RuntimeState } from "./runtime-state.js";
import { publicSession } from "./session-records.js";

export function publish(
  state: RuntimeState,
  event: Omit<SessionEvent, "revision">,
): void {
  const record: SessionEvent = { ...event, revision: ++state.revision };
  if (event.session)
    record.session = publicSession(event.session as SessionRecord);
  queueMicrotask(() => {
    for (const listener of state.listeners) {
      try {
        listener(structuredClone(record));
      } catch {
        state.listeners.delete(listener);
      }
    }
  });
}
export function setInput(
  state: RuntimeState,
  sessionId: string,
  inputId: string,
  status: InputState["state"],
  reason?: InputState["reason"],
): void {
  const input = {
    sessionId,
    inputId,
    state: status,
    ...(reason === undefined ? {} : { reason }),
  };
  if (status === "completed" || status === "failed") {
    state.inputs.delete(sessionId);
    state.cancelAccepted.delete(sessionId);
    state.cancelPending.delete(sessionId);
  } else {
    state.inputs.set(sessionId, input);
    if (status === "uncertain") {
      state.cancelAccepted.delete(sessionId);
      state.cancelPending.delete(sessionId);
    }
  }
  publish(state, { kind: "input.state", sessionId, input });
}
