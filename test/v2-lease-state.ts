import type { LeaseOp } from "./v2-lease-operations.js";
import { LeaseCallbackState } from "./v2-lease-callback-state.js";

export class LeaseState {
  private callbacks = new LeaseCallbackState();
  private next = 1;
  private live = new Set<string>();
  private leases = new Map<
    string,
    { connectionId: string; bindingId: string }
  >();
  private sessions = new Map<string, string>();
  apply(op: LeaseOp): string {
    if (op.op === "connect") {
      this.live.add(op.connectionId);
      return "connected";
    }
    if (op.op === "advance") {
      this.callbacks.advance(op.seconds);
      return "time-advanced";
    }
    if (op.op === "bind") return this.bind(op.connectionId, op.sessionId);
    if (op.op === "request")
      return this.request(
        op.connectionId,
        op.sessionId,
        op.callbackId,
        op.timeoutSeconds,
      );
    if (op.op === "result")
      return this.callbacks.respond(
        op.connectionId,
        op.bindingId,
        op.callbackId,
        this.live.has(op.connectionId),
        (sessionId, connectionId, bindingId) => {
          const lease = this.leases.get(sessionId);
          return (
            lease?.connectionId === connectionId &&
            lease.bindingId === bindingId
          );
        },
      );
    if (op.op === "cancel") return this.callbacks.cancel(op.callbackId);
    if (op.op === "unbind") return this.unbind(op.connectionId, op.bindingId);
    if (op.op === "status") return this.sessions.get(op.sessionId) ?? "missing";
    this.live.delete(op.connectionId);
    for (const [id, lease] of this.leases)
      if (lease.connectionId === op.connectionId) this.leases.delete(id);
    return "detached";
  }
  private bind(connectionId: string, sessionId: string): string {
    const current = this.leases.get(sessionId);
    if (!this.live.has(connectionId)) return "unavailable";
    if (current && this.live.has(current.connectionId)) return "conflict";
    const bindingId = `B${this.next++}`;
    this.leases.set(sessionId, { connectionId, bindingId });
    return `bound:${bindingId}`;
  }
  private request(
    connectionId: string,
    sessionId: string,
    callbackId: string,
    timeoutSeconds: number,
  ): string {
    const lease = this.leases.get(sessionId);
    if (
      !lease ||
      lease.connectionId !== connectionId ||
      !this.live.has(connectionId)
    )
      return "no-lease";
    this.callbacks.request(
      connectionId,
      lease.bindingId,
      callbackId,
      timeoutSeconds,
      sessionId,
    );
    this.sessions.set(sessionId, "running/process-owned");
    return "pending";
  }
  private unbind(connectionId: string, bindingId: string): string {
    const found = [...this.leases].find(
      ([, lease]) => lease.bindingId === bindingId,
    );
    if (!found || found[1].connectionId !== connectionId)
      return "stale-binding";
    this.callbacks.invalidateBinding(connectionId, bindingId);
    this.leases.delete(found[0]);
    return "unbound";
  }
}
