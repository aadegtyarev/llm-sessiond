type Pending = {
  connectionId: string;
  bindingId: string;
  sessionId: string;
  deadline: number;
  settled: boolean;
  canceled: boolean;
};
export class LeaseCallbackState {
  private now = 0;
  private pending = new Map<string, Pending>();
  advance(seconds: number): void {
    this.now += seconds;
  }
  invalidateBinding(connectionId: string, bindingId: string): void {
    for (const cb of this.pending.values())
      if (
        cb.connectionId === connectionId &&
        cb.bindingId === bindingId &&
        !cb.settled
      )
        cb.canceled = true;
  }
  request(
    connectionId: string,
    bindingId: string,
    callbackId: string,
    timeoutSeconds: number,
    sessionId: string,
  ): void {
    this.pending.set(callbackId, {
      connectionId,
      bindingId,
      sessionId,
      deadline: this.now + timeoutSeconds,
      settled: false,
      canceled: false,
    });
  }
  respond(
    connectionId: string,
    bindingId: string,
    callbackId: string,
    live: boolean,
    active: (
      sessionId: string,
      connectionId: string,
      bindingId: string,
    ) => boolean,
  ): string {
    const cb = this.pending.get(callbackId);
    if (!cb) return "unknown-callback";
    if (!live || cb.connectionId !== connectionId || cb.bindingId !== bindingId)
      return "wrong-connection";
    if (!active(cb.sessionId, connectionId, bindingId)) return "stale-binding";
    if (cb.canceled) {
      cb.settled = true;
      return "canceled-late-ignored";
    }
    if (cb.settled) return "duplicate";
    if (this.now >= cb.deadline) {
      cb.settled = true;
      return "late";
    }
    cb.settled = true;
    return "accepted";
  }
  cancel(callbackId: string): string {
    const cb = this.pending.get(callbackId);
    if (!cb || cb.settled) return "not-pending";
    cb.canceled = true;
    return "canceled";
  }
}
