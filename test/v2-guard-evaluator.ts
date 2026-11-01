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
  const dispatched = new Set<string>();
  const uncertain = new Set<string>();
  let connected = true;
  for (const op of ops) {
    if (op.op === "disconnect") {
      connected = false;
      for (const id of dispatched) uncertain.add(id);
      guards.clear();
      outcomes.push(
        uncertain.size ? "uncertain-no-replay" : "disconnected-invalidated",
      );
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
        if (dispatched.has(op.contextId)) uncertain.add(op.contextId);
        outcomes.push(
          uncertain.has(op.contextId)
            ? "uncertain-no-replay"
            : "awaiting-invalidate-ack",
        );
      }
    } else if (op.op === "ack") {
      if (current?.generation === op.generation) {
        current.acknowledged = true;
        outcomes.push("acknowledged");
      } else outcomes.push("stale-ack");
    } else if (!connected) {
      if (dispatched.has(op.contextId) || op.boundary === "post") {
        uncertain.add(op.contextId);
        outcomes.push("uncertain-no-replay");
      } else outcomes.push("rejected-before-write");
    } else if (
      !current?.acknowledged ||
      current.generation !== op.generation ||
      current.sessionId !== op.sessionId
    ) {
      if (
        dispatched.has(op.contextId) ||
        uncertain.has(op.contextId) ||
        op.boundary === "post"
      ) {
        uncertain.add(op.contextId);
        outcomes.push("uncertain-no-replay");
      } else outcomes.push("rejected-before-write");
    } else {
      dispatched.add(op.contextId);
      outcomes.push("write-dispatched");
    }
  }
  return outcomes;
}
