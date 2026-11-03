import type { RuntimeState } from "./runtime-state.js";
import { stopOutcome } from "./port-outcomes.js";
import { current } from "./store-access.js";
import { save } from "./runtime-support.js";
import { setInput } from "./runtime-events.js";

export function shutdownRuntime(state: RuntimeState): Promise<boolean> {
  if (state.shutdownPromise) return state.shutdownPromise;
  if (state.closing) return Promise.resolve(false);
  if (!current(state)) return Promise.resolve(false);
  state.closing = true;
  const sessions = [...state.sessions.entries()];
  for (const [id] of sessions) {
    state.stopping.add(id);
    state.sources.set(id, (state.sources.get(id) ?? 0) + 1);
  }
  state.shutdownPromise = drain(state, sessions);
  return state.shutdownPromise;
}

async function drain(
  state: RuntimeState,
  sessions: Array<
    [string, import("../interfaces/runtime-ports.js").SessionRecord]
  >,
): Promise<boolean> {
  const results = await Promise.all(
    [...state.ports].map(async ([id, target]) => {
      try {
        return [id, stopOutcome(await target.port.shutdown())] as const;
      } catch {
        return [id, { kind: "unknown" as const }] as const;
      }
    }),
  );
  if (!current(state)) {
    for (const [id] of sessions) {
      const active = state.inputs.get(id);
      if (active) state.inputs.set(id, { ...active, state: "uncertain" });
    }
    return false;
  }
  for (const [harnessId, result] of results) {
    for (const [id, session] of sessions) {
      if (session.harnessId !== harnessId) continue;
      const active = state.inputs.get(id);
      if (active) setInput(state, id, active.inputId, "uncertain");
      if (result.kind === "confirmed") {
        state.inputs.delete(id);
        state.cancelAccepted.delete(id);
        state.cancelPending.delete(id);
        try {
          await save(state, { ...session, status: "stopped" });
        } catch {
          return false;
        }
      } else {
        try {
          await save(state, { ...session, status: "uncertain" });
        } catch {
          return false;
        }
      }
    }
  }
  return (
    results.every(([, result]) => result.kind === "confirmed") &&
    state.inputs.size === 0
  );
}
