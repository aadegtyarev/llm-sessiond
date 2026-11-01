import type { DurableManagerContext } from "./durable-manager-context.js";
import { ControlPlaneError } from "./control-plane-error.js";
import {
  DurableInputState,
  type InputOperation,
} from "./durable-input-state.js";
import { InputRuntimeError } from "./input-runtime-error.js";
import type { ValidatedInput } from "./input-validation.js";
import { validateSessionId } from "./durable-validation.js";
import { resumeSession } from "./session-resume.js";
import { DurableSessionManagerRead } from "./session-read-metadata.js";
import {
  requireCapability,
  resolveAdapter,
} from "./session-lifecycle-support.js";

export async function admitInput(
  context: DurableManagerContext,
  state: DurableInputState,
  generateId: () => string,
  sessionId: string,
  input: ValidatedInput,
) {
  const row = DurableSessionManagerRead.get(context.store, sessionId);
  const adapter = resolveAdapter(context.registry, row.harnessId);
  requireCapability(adapter, "input.submit");
  if ((input.images?.length ?? 0) > 0)
    requireCapability(adapter, "input.submit-images");
  if (state.current(sessionId)) throw new ControlPlaneError("INPUT_BUSY");
  let inputId: string;
  try {
    inputId = generateId();
    validateSessionId(inputId);
  } catch {
    throw new ControlPlaneError("INVALID_SESSION_ID");
  }
  if (!state.reserve(inputId) || context.store.get(inputId))
    throw new ControlPlaneError("SESSION_ID_COLLISION");
  const wasStopped = row.status === "stopped";
  let execution = context.owned.get(sessionId);
  if (wasStopped) {
    try {
      execution = context.factory.create(adapter);
    } catch {
      throw new InputRuntimeError("SESSION_UNAVAILABLE", inputId, false);
    }
    if (!execution.inputs)
      throw new ControlPlaneError("UNSUPPORTED_CAPABILITY");
    try {
      await resumeSession(context, sessionId, execution);
    } catch {
      throw new InputRuntimeError("SESSION_UNAVAILABLE", inputId, false);
    }
  }
  const current = DurableSessionManagerRead.get(context.store, sessionId);
  if (current.status !== "running" || !execution?.inputs)
    throw new InputRuntimeError("SESSION_UNAVAILABLE", inputId, false);
  const operation: InputOperation = {
    id: inputId,
    sessionId,
    execution,
    state: "pending",
    unsubscribe: undefined,
  };
  state.register(operation);
  let command: Promise<unknown>;
  try {
    command = Promise.resolve(execution.inputs.submit({ inputId, ...input }));
  } catch {
    command = Promise.resolve({ kind: "uncertain" });
  }
  return { operation, command, resumed: wasStopped };
}
