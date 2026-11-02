import { randomUUID } from "node:crypto";

export class PiDurableRpcPending {
  private readonly requests = new Map<
    string,
    {
      command: string;
      resolve: (record: Record<string, unknown>) => void;
      reject: (error?: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  begin(command: string, timeoutMs: number) {
    const id = randomUUID();
    const promise = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.requests.delete(id);
        reject(new Error("RPC_UNCERTAIN"));
      }, timeoutMs);
      this.requests.set(id, {
        command,
        resolve,
        reject: (error = new Error("RPC_UNCERTAIN")) => reject(error),
        timer,
      });
    });
    return { id, promise };
  }
  abandon(id: string): void {
    const request = this.requests.get(id);
    if (!request) return;
    clearTimeout(request.timer);
    this.requests.delete(id);
    request.reject(new Error("RPC_NOT_DISPATCHED"));
  }
  receive(record: Record<string, unknown>): boolean {
    if (typeof record.id !== "string") return false;
    const request = this.requests.get(record.id);
    if (!request) return true;
    clearTimeout(request.timer);
    this.requests.delete(record.id);
    if (
      record.command !== request.command ||
      typeof record.success !== "boolean"
    ) {
      request.reject();
      return false;
    }
    request.resolve(record);
    return true;
  }
  fail(): void {
    for (const request of this.requests.values()) {
      clearTimeout(request.timer);
      request.reject();
    }
    this.requests.clear();
  }
}
