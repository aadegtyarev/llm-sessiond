import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import type {
  ManagedSessionEventRecord,
  ManagedSessionSnapshot,
} from "../core/managed-session-events.js";
import { v2SessionSchema } from "./v2-session-schema.js";
import { v2LiveEventSchema } from "./v2-bridge-schema.js";
import type { Buffered, BridgePeer } from "./v2-bridge-peer-state.js";
import { sendFrame } from "./v2-bridge-peer.js";

export function sendSnapshot(
  socket: WebSocket,
  instanceId: string,
  snapshot: ManagedSessionSnapshot,
  afterSequence: number,
  buffered: Array<{ sequence: number; record: ManagedSessionEventRecord }>,
): boolean {
  const snapshotId = randomUUID();
  if (
    !sendFrame(socket, {
      apiVersion: "v2",
      type: "snapshot.begin",
      snapshotId,
      afterSequence,
    })
  )
    return false;
  try {
    for (const row of snapshot.sessions)
      if (
        !sendFrame(socket, {
          apiVersion: "v2",
          type: "snapshot.session",
          snapshotId,
          session: v2SessionSchema.parse(row),
        })
      )
        return false;
  } catch {
    socket.close(1011, "snapshot unavailable");
    return false;
  }
  if (
    !sendFrame(socket, { apiVersion: "v2", type: "snapshot.end", snapshotId })
  )
    return false;
  for (const item of buffered)
    if (
      item.record.revision > snapshot.afterRevision &&
      !sendFrame(socket, liveFrame(instanceId, item.sequence, item.record))
    )
      return false;
  return true;
}

export function flushPeer(
  peer: BridgePeer,
  instanceId: string,
  sequence: number,
): boolean {
  if (peer.snapshotSent || !peer.snapshot || peer.boundary === undefined)
    return true;
  const ok = sendSnapshot(
    peer.socket,
    instanceId,
    peer.snapshot,
    sequence,
    peer.buffered,
  );
  if (ok) {
    peer.buffered = [];
    peer.snapshotSent = true;
  }
  return ok;
}

export function sendBridgeEvent(
  socket: WebSocket,
  instanceId: string,
  item: Buffered,
): boolean {
  const frame = liveFrame(instanceId, item.sequence, item.record);
  return v2LiveEventSchema.safeParse(frame).success && sendFrame(socket, frame);
}

export function liveFrame(
  instanceId: string,
  sequence: number,
  record: ManagedSessionEventRecord,
) {
  return {
    apiVersion: "v2",
    type: "event",
    instanceId,
    sequence,
    at: new Date().toISOString(),
    event: record.event,
  };
}
