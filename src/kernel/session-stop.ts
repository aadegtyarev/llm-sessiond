import type {
  SessionRecord,
  StopOutcome,
} from "../interfaces/runtime-ports.js";
import type { RuntimeState } from "./runtime-state.js";
import { stopOutcome } from "./port-outcomes.js";
import { current, port, read } from "./store-access.js";
import { nextSource, save, withSessionLock } from "./runtime-support.js";
import { setInput } from "./runtime-events.js";
import { sessionId } from "./session-records.js";

export function stopSession(state: RuntimeState, id: string): Promise<boolean> {
  id = sessionId(id);
  const existing = state.stopOperations.get(id);
  if (existing) return existing;
  return withSessionLock(state, id, () => stopOnce(state, id));
}

async function stopOnce(state: RuntimeState, id: string): Promise<boolean> {
  if (!current(state)) throw new Error("Runtime unavailable");
  const session = read(state, id);
  if (!session) throw new Error("Session unavailable");
  if (session.status === "stopped") return true;
  if (state.closing) throw new Error("Runtime unavailable");
  const target = port(state, session.harnessId);
  if (!target.descriptor.capabilities.includes("harness.stop"))
    throw new Error("Stop unsupported");
  state.stopping.add(id);
  const epoch = nextSource(state, id);
  state.sessions.delete(id);
  const operation = Promise.resolve().then(() =>
    finishStop(
      state,
      id,
      session,
      target.port.stop.bind(target.port, id),
      epoch,
    ),
  );
  state.stopOperations.set(id, operation);
  try {
    return await operation;
  } finally {
    state.stopping.delete(id);
    state.stopOperations.delete(id);
  }
}

async function finishStop(
  state: RuntimeState,
  id: string,
  session: SessionRecord,
  stop: () => Promise<StopOutcome>,
  epoch: number,
): Promise<boolean> {
  let outcome;
  try {
    outcome = stopOutcome(await stop());
  } catch {
    outcome = { kind: "unknown" as const };
  }
  const active = state.inputs.get(id);
  if (!current(state)) {
    if (active) state.inputs.set(id, { ...active, state: "uncertain" });
    return false;
  }
  if (state.sources.get(id) !== epoch && outcome.kind !== "confirmed")
    return false;
  if (active) setInput(state, id, active.inputId, "uncertain");
  if (outcome.kind !== "confirmed") {
    await save(state, { ...session, status: "uncertain" });
    return false;
  }
  state.inputs.delete(id);
  state.cancelAccepted.delete(id);
  state.cancelPending.delete(id);
  await save(state, { ...session, status: "stopped" });
  return true;
}
