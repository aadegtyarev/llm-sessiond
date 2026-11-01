import type { DurableManagerContext } from "./durable-manager-context.js";
import { ControlPlaneError } from "./control-plane-error.js";
import {
  DurableInputState,
  type InputOperation,
} from "./durable-input-state.js";
import { InputRuntimeError } from "./input-runtime-error.js";
import { hasInputSubmitPort } from "./has-input-submit-port.js";
import { validateInput } from "./input-validation.js";
import { validateSessionId } from "./durable-validation.js";
import { resumeSession } from "./session-resume.js";
import { DurableSessionManagerRead } from "./session-read-metadata.js";
import {
  assertCurrentOwner,
  requireCapability,
  resolveAdapter,
} from "./session-lifecycle-support.js";

export async function admitInput(
  context: DurableManagerContext,
  state: DurableInputState,
  generateId: () => string,
  sessionId: string,
  value: unknown,
) {
  const row = DurableSessionManagerRead.get(context.store, sessionId);
  assertCurrentOwner(context);
  const input = validateInput(value);
  const adapter = resolveAdapter(context.registry, row.harnessId);
  requireCapability(adapter, "input.submit");
  if ((input.images?.length ?? 0) > 0)
    requireCapability(adapter, "input.submit-images");
  if (state.current(sessionId)) throw new ControlPlaneError("INPUT_BUSY");
  const wasStopped = row.status === "stopped";
  let execution = context.owned.get(sessionId);
  if (!wasStopped && (row.status !== "running" || !execution))
    throw new ControlPlaneError("SESSION_UNAVAILABLE");
  if (execution && !hasInputSubmitPort(execution))
    throw new ControlPlaneError("UNSUPPORTED_CAPABILITY");
  let inputId: string;
  try {
    inputId = generateId();
    validateSessionId(inputId);
  } catch {
    throw new ControlPlaneError("INVALID_SESSION_ID");
  }
  if (!state.reserve(inputId))
    throw new ControlPlaneError("SESSION_ID_COLLISION");
  if (wasStopped) {
    try {
      execution = context.factory.create(adapter);
    } catch {
      throw new InputRuntimeError("SESSION_UNAVAILABLE", inputId, false);
    }
    if (!execution || !hasInputSubmitPort(execution))
      throw new ControlPlaneError("UNSUPPORTED_CAPABILITY");
    try {
      await resumeSession(context, sessionId, execution);
    } catch {
      throw new InputRuntimeError("SESSION_UNAVAILABLE", inputId, false);
    }
  }
  const current = DurableSessionManagerRead.get(context.store, sessionId);
  const source = execution && state.source(sessionId, execution);
  const resumed = wasStopped && current.status === "running";
  if (
    current.status !== "running" ||
    !execution ||
    !source?.live ||
    !source.subscribed
  )
    throw new InputRuntimeError("SESSION_UNAVAILABLE", inputId, resumed);
  assertCurrentOwner(context);
  if (
    context.owned.get(sessionId) !== execution ||
    !state.sourceIsCurrent(source) ||
    !source.live
  )
    throw new InputRuntimeError("SESSION_UNAVAILABLE", inputId, resumed);
  const operation: InputOperation = {
    id: inputId,
    sessionId,
    execution,
    source,
    state: "pending",
    resumed,
    stopInvalidated: false,
    executionEnded: false,
  };
  state.register(operation);
  let command: Promise<unknown>;
  try {
    command = Promise.resolve(execution.inputs!.submit({ inputId, ...input }));
  } catch {
    command = Promise.resolve({ kind: "uncertain" });
  }
  return { operation, command };
}
