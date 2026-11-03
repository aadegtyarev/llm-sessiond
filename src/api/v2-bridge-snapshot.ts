import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import type {
  ManagedSessionEventRecord,
  ManagedSessionSnapshot,
} from "../core/managed-session-events.js";
import { v2SessionSchema } from "./v2-session-schema.js";
import { v2LiveEventSchema } from "./v2-bridge-schema.js";
import { sendFrame } from "./v2-bridge-peer.js";

export function sendSnapshot(
  socket: WebSocket,
  snapshot: ManagedSessionSnapshot,
): boolean {
  const snapshotId = randomUUID();
  if (
    !sendFrame(socket, {
      apiVersion: "v2",
      type: "snapshot.begin",
      snapshotId,
      afterSequence: snapshot.afterRevision,
    })
  )
    return false;
  try {
    for (const session of snapshot.sessions)
      if (
        !sendFrame(socket, {
          apiVersion: "v2",
          type: "snapshot.session",
          snapshotId,
          session: v2SessionSchema.parse(session),
        })
      )
        return false;
  } catch {
    socket.close(1011, "snapshot unavailable");
    return false;
  }
  return sendFrame(socket, {
    apiVersion: "v2",
    type: "snapshot.end",
    snapshotId,
  });
}

export function sendBridgeEvent(
  socket: WebSocket,
  instanceId: string,
  record: ManagedSessionEventRecord,
): boolean {
  const event = {
    apiVersion: "v2",
    type: "event",
    instanceId,
    sequence: record.revision,
    at: new Date().toISOString(),
    event: record.event,
  };
  if (!v2LiveEventSchema.safeParse(event).success) {
    socket.close(1011, "event unavailable");
    return false;
  }
  return sendFrame(socket, event);
}
