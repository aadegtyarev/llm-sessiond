import type { LiveStatus } from "../interfaces/runtime-ports.js";
import { projectPiLiveStatus } from "../harness/pi-live-status.js";
import { assertPiQueryCurrent } from "./pi-query-support.js";
import type { PiProcess } from "./pi-process.js";

export async function readPiStatus(process: PiProcess): Promise<LiveStatus> {
  assertPiQueryCurrent(process);
  const [state, stats] = await Promise.all([
    process.rpc.command("get_state"),
    process.rpc.command("get_session_stats"),
  ]);
  assertPiQueryCurrent(process);
  if (
    state.success !== true ||
    stats.success !== true ||
    !state.data ||
    typeof state.data !== "object" ||
    (state.data as Record<string, unknown>).sessionId !==
      process.nativeSessionId ||
    !stats.data ||
    typeof stats.data !== "object"
  )
    throw new Error("Query unavailable");
  return projectPiLiveStatus(state.data, stats.data) as unknown as LiveStatus;
}
