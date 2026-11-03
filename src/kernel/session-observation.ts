import type {
  HarnessDescriptor,
  PublicSession,
  SessionEvent,
  Snapshot,
} from "../interfaces/runtime-ports.js";
import type { RuntimeState } from "./runtime-state.js";
import { list, read, requireOwner } from "./store-access.js";
import { publicSession, sessionId } from "./session-records.js";

export function listSessions(state: RuntimeState): PublicSession[] {
  requireOwner(state);
  const sessions = list(state).map(publicSession);
  requireOwner(state);
  return sessions;
}
export function getSession(
  state: RuntimeState,
  id: string,
): PublicSession | undefined {
  requireOwner(state);
  const session = read(state, sessionId(id));
  requireOwner(state);
  return session && publicSession(session);
}
export function snapshot(state: RuntimeState): Snapshot {
  requireOwner(state);
  const sessions = list(state).map(publicSession);
  requireOwner(state);
  return { afterRevision: state.revision, sessions };
}
export function subscribe(
  state: RuntimeState,
  listener: (event: SessionEvent) => void,
): () => void {
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
}
export function harnesses(state: RuntimeState): {
  defaultHarnessId: string;
  harnesses: HarnessDescriptor[];
} {
  requireOwner(state);
  return {
    defaultHarnessId: state.defaultHarnessId,
    harnesses: [...state.ports.values()].map(({ descriptor }) =>
      structuredClone(descriptor),
    ),
  };
}
