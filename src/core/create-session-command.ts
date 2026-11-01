import { ControlPlaneError } from "./control-plane-error.js";
import type { DurableManagerContext } from "./durable-manager-context.js";
import type { PerSessionLock } from "./per-session-lock.js";
import type { JsonValue } from "./generic-json.js";
import type { DurableSession } from "../persistence/session-record.js";
import { validateLifecycleCwd } from "./lifecycle-cwd-validation.js";
import { validateSessionId } from "./durable-validation.js";
import { createSession } from "./session-launch.js";

export async function createManagedSession(
  context: DurableManagerContext,
  locks: PerSessionLock,
  generateId: () => string,
  input: {
    cwd: string;
    harnessId?: string;
    name?: string;
    options?: JsonValue;
  },
): Promise<DurableSession> {
  const cwd = await validateLifecycleCwd(input.cwd);
  const id = generateId();
  try {
    validateSessionId(id);
  } catch {
    throw new ControlPlaneError("INVALID_SESSION_ID");
  }
  return locks.run(id, () => createSession(context, id, { ...input, cwd }));
}
