import type { PublicSession } from "../interfaces/runtime-ports.js";
import type { RuntimeState } from "./runtime-state.js";
import { startOutcome } from "./port-outcomes.js";
import { current, port, read } from "./store-access.js";
import { nextSource, withSessionLock, writeGuard } from "./runtime-support.js";
import { settleStart } from "./session-start-result.js";
import { onHarnessEvent } from "./session-events.js";

export function resumeSession(
  state: RuntimeState,
  id: string,
): Promise<PublicSession> {
  return withSessionLock(state, id, () => resumeOnce(state, id));
}

async function resumeOnce(
  state: RuntimeState,
  id: string,
): Promise<PublicSession> {
  if (!current(state) || state.closing) throw new Error("Runtime unavailable");
  const session = read(state, id);
  if (!session || session.status !== "stopped" || state.stopping.has(id))
    throw new Error("Session unavailable");
  const harness = port(state, session.harnessId);
  if (!harness.descriptor.capabilities.includes("harness.resume"))
    throw new Error("Resume unsupported");
  const epoch = nextSource(state, id);
  let result;
  try {
    result = startOutcome(
      await harness.port.start(
        {
          sessionId: id,
          harnessId: session.harnessId,
          cwd: session.cwd,
          ...(session.name === undefined ? {} : { name: session.name }),
          ...(session.checkpoint === undefined
            ? {}
            : { checkpoint: structuredClone(session.checkpoint) }),
          ...(session.adapterOptions === undefined
            ? {}
            : { adapterOptions: structuredClone(session.adapterOptions) }),
        },
        (event) => onHarnessEvent(state, event, epoch),
        () => writeGuard(state, id, epoch),
      ),
    );
  } catch {
    result = { kind: "uncertain" as const };
  }
  return settleStart(state, session, epoch, result);
}
