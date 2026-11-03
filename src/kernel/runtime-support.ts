import type { SessionRecord } from "../interfaces/runtime-ports.js";
import type { RuntimeState } from "./runtime-state.js";
import { cleanRecord, sessionId } from "./session-records.js";
import { publish } from "./runtime-events.js";
import { current } from "./store-access.js";

export function save(state: RuntimeState, row: SessionRecord): void {
  if (!current(state)) throw new Error("Runtime unavailable");
  const saved = cleanRecord(row);
  try {
    state.store.write(saved);
  } catch {
    throw new Error("Store unavailable");
  }
  state.sessions.set(saved.id, saved);
  publish(state, {
    kind: "session.changed",
    sessionId: saved.id,
    session: saved,
  });
}
export function nextSource(state: RuntimeState, id: string): number {
  const epoch = (state.sources.get(id) ?? 0) + 1;
  state.sources.set(id, epoch);
  return epoch;
}
export function newId(state: RuntimeState): string {
  try {
    return sessionId(state.makeId());
  } catch {
    throw new Error("Identifier unavailable");
  }
}
export function holdUncertain(
  state: RuntimeState,
  sessionId: string,
  inputId: string,
): void {
  if (state.inputs.get(sessionId)?.inputId === inputId)
    state.inputs.set(sessionId, { sessionId, inputId, state: "uncertain" });
  state.cancelAccepted.delete(sessionId);
  state.cancelPending.delete(sessionId);
}
export function writeGuard(
  state: RuntimeState,
  sessionId: string,
  epoch: number,
): boolean {
  return (
    current(state) &&
    !state.closing &&
    !state.stopping.has(sessionId) &&
    state.sources.get(sessionId) === epoch
  );
}
export async function withSessionLock<T>(
  state: RuntimeState,
  id: string,
  action: () => Promise<T>,
): Promise<T> {
  const previous = state.locks.get(id) ?? Promise.resolve();
  let release!: () => void;
  const currentLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => currentLock);
  state.locks.set(id, queued);
  await previous;
  try {
    return await action();
  } finally {
    release();
    if (state.locks.get(id) === queued) state.locks.delete(id);
  }
}
