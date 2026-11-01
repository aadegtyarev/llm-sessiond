type Op =
  | {
      op: "select";
      contextId: string;
      generation: number;
      sessionId: string | null;
    }
  | { op: "ack"; contextId: string; generation: number }
  | {
      op: "write";
      contextId: string;
      generation: number;
      sessionId: string;
      boundary: "pre" | "post";
    }
  | { op: "disconnect" };
type Guard = {
  generation: number;
  sessionId: string | null;
  acknowledged: boolean;
};
export function evaluateGuards(ops: Op[]): string[] {
  const guards = new Map<string, Guard>();
  const outcomes: string[] = [];
  let connected = true;
  for (const op of ops) {
    if (op.op === "disconnect") {
      connected = false;
      guards.clear();
      outcomes.push("disconnected-invalidated");
      continue;
    }
    const current = guards.get(op.contextId);
    if (op.op === "select") {
      if (current && op.generation <= current.generation)
        outcomes.push("generation-rejected");
      else {
        guards.set(op.contextId, {
          generation: op.generation,
          sessionId: op.sessionId,
          acknowledged: false,
        });
        outcomes.push("awaiting-invalidate-ack");
      }
    } else if (op.op === "ack") {
      if (current?.generation === op.generation) {
        current.acknowledged = true;
        outcomes.push("acknowledged");
      } else outcomes.push("stale-ack");
    } else if (!connected)
      outcomes.push(
        op.boundary === "pre" ? "rejected-before-write" : "unknown-after-write",
      );
    else if (
      !current?.acknowledged ||
      current.generation !== op.generation ||
      current.sessionId !== op.sessionId
    )
      outcomes.push("rejected-before-write");
    else outcomes.push("write-dispatched");
  }
  return outcomes;
}
