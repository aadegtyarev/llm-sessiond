import type {
  PublicSession,
  SessionRecord,
  StartOutcome,
} from "../interfaces/runtime-ports.js";
import type { RuntimeState } from "./runtime-state.js";
import { current, read } from "./store-access.js";
import { publicSession } from "./session-records.js";
import { save } from "./runtime-support.js";

export function settleStart(
  state: RuntimeState,
  session: SessionRecord,
  epoch: number,
  result: StartOutcome,
): PublicSession {
  if (!current(state)) throw new Error("Runtime unavailable");
  const latest = read(state, session.id) ?? session;
  if (
    state.sources.get(session.id) !== epoch ||
    state.stopping.has(session.id)
  ) {
    if (latest.status === "starting") {
      const uncertain = { ...latest, status: "uncertain" as const };
      save(state, uncertain);
      return publicSession(uncertain);
    }
    return publicSession(latest);
  }
  const updated: SessionRecord = {
    ...latest,
    status:
      result.kind === "started"
        ? "running"
        : result.kind === "failed"
          ? "failed"
          : "uncertain",
    ...(result.kind === "failed"
      ? {
          failureReason: "HARNESS_START_FAILED",
          failedAt: new Date().toISOString(),
        }
      : {}),
    ...(result.kind === "started" && result.nativeSessionId
      ? { nativeSessionId: result.nativeSessionId }
      : {}),
    ...(result.kind === "started" && result.checkpoint
      ? { checkpoint: result.checkpoint }
      : {}),
  };
  if (result.kind === "started") {
    delete updated.failureReason;
    delete updated.failedAt;
  }
  save(state, updated);
  return publicSession(updated);
}
