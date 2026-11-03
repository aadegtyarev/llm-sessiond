import type {
  PublicSession,
  SessionRecord,
} from "../interfaces/runtime-ports.js";
import type { RuntimeState } from "./runtime-state.js";
import { copySafeJson } from "./safe-json.js";
import { current, port, read, write } from "./store-access.js";
import { newId, nextSource, writeGuard } from "./runtime-support.js";
import { publish } from "./runtime-events.js";
import { onHarnessEvent } from "./session-events.js";
import { startOutcome } from "./port-outcomes.js";
import { settleStart } from "./session-start-result.js";

export async function createSession(
  state: RuntimeState,
  config: {
    cwd: string;
    name?: string;
    harnessId?: string;
    adapterOptions?: Record<string, unknown>;
  },
): Promise<PublicSession> {
  if (!current(state) || state.closing) throw new Error("Runtime unavailable");
  const id = newId(state);
  if (read(state, id)) throw new Error("Session already exists");
  const session: SessionRecord = {
    id,
    harnessId: config.harnessId ?? state.defaultHarnessId,
    cwd: config.cwd,
    status: "starting",
    createdAt: new Date().toISOString(),
    ...(config.name === undefined ? {} : { name: config.name }),
    ...(config.adapterOptions === undefined
      ? {}
      : {
          adapterOptions: copySafeJson(
            config.adapterOptions,
            8192,
            5,
          ) as Record<string, unknown>,
        }),
  };
  const harness = port(state, session.harnessId);
  write(state, session);
  state.sessions.set(id, session);
  publish(state, { kind: "session.changed", sessionId: id, session });
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
