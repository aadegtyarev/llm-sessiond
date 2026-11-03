import type { PublicSession } from "../interfaces/runtime-ports.js";
import type { RuntimeState } from "./runtime-state.js";
import { current, read, remove } from "./store-access.js";
import { save } from "./runtime-support.js";
import { publish } from "./runtime-events.js";
import { publicSession, sessionId } from "./session-records.js";

export async function renameSession(
  state: RuntimeState,
  id: string,
  name: string | null | undefined,
): Promise<PublicSession> {
  if (!current(state) || state.closing) throw new Error("Runtime unavailable");
  id = sessionId(id);
  const session = read(state, id);
  if (!session || state.stopping.has(id))
    throw new Error("Session unavailable");
  const updated = { ...session };
  if (name === null) delete updated.name;
  else if (name !== undefined) updated.name = name;
  await save(state, updated);
  return publicSession(updated);
}

export function deleteSession(state: RuntimeState, id: string): void {
  if (!current(state) || state.closing) throw new Error("Runtime unavailable");
  id = sessionId(id);
  const session = read(state, id);
  if (!session) throw new Error("Session unavailable");
  if (session.status !== "stopped") throw new Error("Session busy");
  if (state.inputs.has(id)) throw new Error("Session has active input");
  if (state.stopping.has(id)) throw new Error("Session is stopping");
  remove(state, id);
  state.sessions.delete(id);
  publish(state, { kind: "session.deleted", sessionId: id });
}
