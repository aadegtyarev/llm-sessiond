import { WebSocket } from "ws";
import type { DurableSessionManager } from "../core/durable-session-manager.js";
import type { ManagedSessionEventRecord } from "../core/managed-session-events.js";
import { flushPeer, sendBridgeEvent } from "./v2-bridge-snapshot.js";
import { closeBridgePeers, type BridgePeer } from "./v2-bridge-peer-state.js";

export class V2BridgeHub {
  private baseline = 0;
  private initialized = false;
  private readonly peers = new Set<BridgePeer>();
  private readonly unsubscribe: () => void;
  private revision = 0;
  private sequence = 0;
  private unavailable = false;
  constructor(
    private readonly manager: DurableSessionManager,
    private readonly instanceId: string,
    private readonly ready: () => void,
  ) {
    this.unsubscribe = manager.events.subscribe(
      (record) => this.publish(record),
      () => this.fail(),
    );
  }
  open(socket: WebSocket, ready: () => void): () => void {
    const peer: BridgePeer = {
      socket,
      buffered: [],
      bytes: 0,
      snapshotSent: false,
    };
    if (this.unavailable) {
      socket.close(1011, "observation unavailable");
      return () => {};
    }
    try {
      ready();
      peer.snapshot = this.manager.events.snapshot();
      ready();
      if (!this.initialized) {
        this.baseline = peer.snapshot.afterRevision;
        this.revision = this.baseline;
        this.sequence = 0;
        this.initialized = true;
      }
      this.peers.add(peer);
      peer.boundary = peer.snapshot.afterRevision;
      this.flush(peer);
    } catch {
      socket.close(1011, "snapshot unavailable");
      this.peers.delete(peer);
    }
    return () => this.peers.delete(peer);
  }
  close(): void {
    this.unsubscribe();
    this.fail();
  }
  private publish(record: ManagedSessionEventRecord): void {
    if (record.revision <= this.baseline || this.unavailable) return;
    try {
      this.ready();
    } catch {
      this.fail();
      return;
    }
    if (!Number.isSafeInteger(this.sequence + 1)) return this.fail();
    const sequence = ++this.sequence;
    this.revision = record.revision;
    const item = { sequence, record };
    for (const peer of this.peers) {
      if (peer.boundary === undefined) {
        peer.bytes += Buffer.byteLength(JSON.stringify(record));
        if (peer.bytes > 4 * 1024 * 1024) {
          peer.socket.close(1013, "observation buffer exceeded");
          this.peers.delete(peer);
          continue;
        }
        peer.buffered.push(item);
      } else if (
        record.revision > peer.boundary &&
        !sendBridgeEvent(peer.socket, this.instanceId, item)
      )
        this.peers.delete(peer);
      this.flush(peer);
    }
  }
  private flush(peer: BridgePeer): void {
    const waiting =
      peer.boundary === undefined || this.revision < peer.boundary;
    if (!waiting && !flushPeer(peer, this.instanceId, this.sequence))
      this.peers.delete(peer);
  }
  private fail(): void {
    this.unavailable = true;
    closeBridgePeers(this.peers);
  }
}
