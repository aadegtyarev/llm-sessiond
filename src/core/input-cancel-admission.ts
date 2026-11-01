import { ControlPlaneError } from "./control-plane-error.js";
import type { DurableManagerContext } from "./durable-manager-context.js";
import type { InputOperation } from "./durable-input-state.js";
import { DurableSessionManagerRead } from "./session-read-metadata.js";
import {
  requireCapability,
  resolveAdapter,
} from "./session-lifecycle-support.js";

export async function admitInputCancel(
  context: DurableManagerContext,
  sessionId: string,
  inputId: string,
  current: boolean,
  operation?: InputOperation,
) {
  const row = DurableSessionManagerRead.get(context.store, sessionId);
  const adapter = resolveAdapter(context.registry, row.harnessId);
  requireCapability(adapter, current ? "input.cancel-current" : "input.cancel");
  if (!operation || inputId !== operation.id)
    throw new ControlPlaneError("INPUT_NOT_CURRENT");
  if (operation.state === "uncertain")
    throw new ControlPlaneError("INPUT_UNCERTAIN");
  if (operation.state !== "accepted") throw new ControlPlaneError("INPUT_BUSY");
  const port = operation.execution.inputs;
  if (!port) throw new ControlPlaneError("UNSUPPORTED_CAPABILITY");
  operation.state = "canceling";
  let promise: Promise<unknown>;
  try {
    promise = Promise.resolve(port.cancel(operation.id));
  } catch {
    promise = Promise.resolve({ kind: "uncertain" });
  }
  return { operation, promise };
}
