import { WebSocket } from "ws";
import type { DurableSessionManager } from "../core/durable-session-manager.js";
import type { ManagedSessionEventRecord } from "../core/managed-session-events.js";
import { sendBridgeEvent, sendSnapshot } from "./v2-bridge-snapshot.js";

export class V2BridgeHub {
  private readonly peers = new Set<{ socket: WebSocket; boundary: number }>();
  private readonly unsubscribe: () => void;
  private unavailable = false;
  constructor(
    private readonly manager: DurableSessionManager,
    private readonly instanceId: string,
    private readonly ready: () => void,
  ) {
    this.unsubscribe = this.manager.events.subscribe(
      (record) => this.publish(record),
      () => this.fail(),
    );
  }
  open(socket: WebSocket, ready: () => void): () => void {
    if (this.unavailable) {
      socket.close(1011, "observation unavailable");
      return () => {};
    }
    try {
      ready();
      const snapshot = this.manager.events.snapshot();
      ready();
      if (!sendSnapshot(socket, snapshot)) return () => {};
      const peer = { socket, boundary: snapshot.afterRevision };
      this.peers.add(peer);
      return () => this.peers.delete(peer);
    } catch {
      socket.close(1011, "snapshot unavailable");
      return () => {};
    }
  }
  close(): void {
    this.unsubscribe();
    this.fail();
  }
  private publish(record: ManagedSessionEventRecord): void {
    if (this.unavailable) return;
    try {
      this.ready();
    } catch {
      this.fail();
      return;
    }
    for (const peer of this.peers) {
      if (record.revision <= peer.boundary) continue;
      if (!sendBridgeEvent(peer.socket, this.instanceId, record))
        this.peers.delete(peer);
    }
  }
  private fail(): void {
    this.unavailable = true;
    for (const { socket } of this.peers)
      socket.close(1011, "observation unavailable");
    this.peers.clear();
  }
}
