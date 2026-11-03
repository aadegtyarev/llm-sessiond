import type { SessionRecord } from "../interfaces/runtime-ports.js";
import type { RuntimeState } from "./runtime-state.js";
import { read } from "./store-access.js";
import { resumeSession } from "./session-resume.js";

export async function resumeForInput(
  state: RuntimeState,
  id: string,
  session: SessionRecord,
): Promise<{ session?: SessionRecord; resumed: boolean; failed?: boolean }> {
  if (session.status !== "stopped") return { session, resumed: false };
  if (state.resuming.has(id)) throw new Error("Input busy");
  state.resuming.add(id);
  try {
    await resumeSession(state, id);
    const latest = read(state, id);
    return latest
      ? { session: latest, resumed: true }
      : { resumed: true, failed: true };
  } catch {
    return { resumed: true, failed: true };
  } finally {
    state.resuming.delete(id);
  }
}
