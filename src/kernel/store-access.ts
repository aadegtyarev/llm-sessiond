import type {
  HarnessPort,
  SessionRecord,
} from "../interfaces/runtime-ports.js";
import type { RuntimeState } from "./runtime-state.js";
import { cleanRecord, sessionId } from "./session-records.js";

export function current(state: RuntimeState): boolean {
  try {
    state.store.assertOwner();
    return true;
  } catch {
    return false;
  }
}
export function requireOwner(state: RuntimeState): void {
  if (!current(state)) throw new Error("Runtime unavailable");
}
export function read(
  state: RuntimeState,
  id: string,
): SessionRecord | undefined {
  requireOwner(state);
  id = sessionId(id);
  try {
    const row = state.store.read(id);
    return row && cleanRecord(row);
  } catch {
    throw new Error("Store unavailable");
  }
}
export function list(state: RuntimeState): SessionRecord[] {
  requireOwner(state);
  try {
    return state.store.list().map(cleanRecord);
  } catch {
    throw new Error("Store unavailable");
  }
}
export function write(state: RuntimeState, row: SessionRecord): void {
  requireOwner(state);
  try {
    state.store.write(cleanRecord(row));
  } catch {
    throw new Error("Store unavailable");
  }
}
export function remove(state: RuntimeState, id: string): void {
  requireOwner(state);
  try {
    state.store.delete(sessionId(id));
  } catch {
    throw new Error("Store unavailable");
  }
}
export function port(
  state: RuntimeState,
  id: string,
): { port: HarnessPort; descriptor: HarnessPort["descriptor"] } {
  const found = state.ports.get(id);
  if (!found) throw new Error("Harness unsupported");
  return found;
}
