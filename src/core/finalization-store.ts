import { ControlPlaneError } from "./control-plane-error.js";
import type { DurableManagerContext } from "./durable-manager-context.js";
import type { DurableSession } from "../persistence/session-record.js";
import { assertCurrentOwner } from "./session-lifecycle-support.js";
export function persistFinalization(
  context: DurableManagerContext,
  id: string,
  status: DurableSession["status"],
  reason: string | null,
  at: string | null,
): boolean {
  try {
    assertCurrentOwner(context);
  } catch (error) {
    if (error instanceof ControlPlaneError && error.code === "STALE_OWNER")
      return false;
    throw error;
  }
  context.store.setStatus(id, status, reason, at);
  return true;
}
