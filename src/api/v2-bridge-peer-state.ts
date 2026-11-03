import { WebSocket } from "ws";
import type {
  ManagedSessionEventRecord,
  ManagedSessionSnapshot,
} from "../core/managed-session-events.js";

export type Buffered = { sequence: number; record: ManagedSessionEventRecord };
export type BridgePeer = {
  socket: WebSocket;
  boundary?: number;
  snapshot?: ManagedSessionSnapshot;
  buffered: Buffered[];
  bytes: number;
  snapshotSent: boolean;
};
export function closeBridgePeers(peers: Set<BridgePeer>): void {
  for (const peer of peers) peer.socket.close(1011, "observation unavailable");
  peers.clear();
}
