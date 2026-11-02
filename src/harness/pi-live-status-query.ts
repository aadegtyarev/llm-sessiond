import type { LiveStatus } from "../core/live-status.js";
import type { PiDurableRpcLink } from "./pi-durable-rpc-link.js";
import { projectPiLiveStatus as project } from "./pi-live-status.js";

export async function readPiLiveStatus(
  link: PiDurableRpcLink,
  expectedSessionId: string | undefined,
  isCurrent: () => boolean,
): Promise<LiveStatus> {
  if (!link.writable || !isCurrent()) throw new Error("RPC_UNAVAILABLE");
  const [stateReply, statsReply] = await Promise.all([
    link.command("get_state", {}),
    link.command("get_session_stats", {}),
  ]);
  if (!link.writable || !isCurrent()) throw new Error("RPC_UNAVAILABLE");
  const state = controlData(stateReply);
  const stats = controlData(statsReply);
  if (state.sessionId !== expectedSessionId)
    throw new Error("INVALID_LIVE_STATUS");
  return project(state, stats);
}
function controlData(reply: Record<string, unknown>): Record<string, unknown> {
  const data = reply.data;
  if (
    reply.success !== true ||
    typeof data !== "object" ||
    data === null ||
    Array.isArray(data)
  ) {
    throw new Error("INVALID_LIVE_STATUS");
  }
  return data as Record<string, unknown>;
}
