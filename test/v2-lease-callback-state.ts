type Pending = {
  connectionId: string;
  bindingId: string;
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
  request(
    connectionId: string,
    bindingId: string,
    callbackId: string,
    timeoutSeconds: number,
  ): void {
    this.pending.set(callbackId, {
      connectionId,
      bindingId,
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
  ): string {
    const cb = this.pending.get(callbackId);
    if (!cb) return "unknown-callback";
    if (!live || cb.connectionId !== connectionId || cb.bindingId !== bindingId)
      return "wrong-connection";
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
