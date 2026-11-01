import type { LeaseOp } from "./v2-lease-operations.js";
import { LeaseState } from "./v2-lease-state.js";
export function evaluateLease(ops: LeaseOp[]): string[] {
  const state = new LeaseState();
  return ops.map((op) => state.apply(op));
}
