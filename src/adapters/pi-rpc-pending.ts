type PendingReply = {
  type: string;
  resolve(value: Record<string, unknown>): void;
  reject(reason?: unknown): void;
  onResponse?: (record: Record<string, unknown>) => void;
  timer: NodeJS.Timeout;
};
export class PiRpcPending {
  private sequence = 0;
  private readonly pending = new Map<number, PendingReply>();
  begin(
    type: string,
    timeoutMs: number,
    onResponse?: (record: Record<string, unknown>) => void,
  ) {
    const id = ++this.sequence;
    let resolve!: (value: Record<string, unknown>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<Record<string, unknown>>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    const timer = setTimeout(() => {
      this.pending.delete(id);
      reject(new Error("RPC timeout"));
    }, timeoutMs);
    this.pending.set(id, {
      type,
      resolve,
      reject,
      timer,
      ...(onResponse ? { onResponse } : {}),
    });
    return { id, promise };
  }
  receive(record: Record<string, unknown>): boolean {
    const id = record.id;
    const reply = this.pending.get(Number(id));
    if (
      !reply ||
      !Number.isSafeInteger(id) ||
      record.command !== reply.type ||
      typeof record.success !== "boolean"
    )
      return false;
    try {
      reply.onResponse?.(record);
    } catch {
      return false;
    }
    this.settle(Number(id));
    reply.resolve(record);
    return true;
  }
  abandon(id: number): void {
    const reply = this.pending.get(id);
    if (!reply) return;
    this.settle(id);
    reply.reject(new Error("RPC not written"));
  }
  fail(): void {
    for (const [id, reply] of this.pending) {
      this.settle(id);
      reply.reject(new Error("RPC unavailable"));
    }
  }
  private settle(id: number): void {
    const reply = this.pending.get(id);
    if (reply) clearTimeout(reply.timer);
    this.pending.delete(id);
  }
}
