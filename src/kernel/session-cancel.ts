import type { CancelOutcome } from "../interfaces/runtime-ports.js";
import type { RuntimeState } from "./runtime-state.js";
import { cancelOutcome } from "./port-outcomes.js";
import { current, port, read } from "./store-access.js";
import { holdUncertain, writeGuard } from "./runtime-support.js";
import { setInput } from "./runtime-events.js";
import { sessionId } from "./session-records.js";

export async function cancelInput(
  state: RuntimeState,
  id: string,
  inputId: string,
  currentOnly = false,
): Promise<CancelOutcome> {
  if (!current(state) || state.closing) throw new Error("Runtime unavailable");
  id = sessionId(id);
  inputId = sessionId(inputId);
  const session = read(state, id);
  const input = state.inputs.get(id);
  if (
    !session ||
    !input ||
    input.inputId !== inputId ||
    input.state !== "accepted" ||
    state.cancelAccepted.has(id) ||
    state.cancelPending.has(id)
  )
    throw new Error("Input not current");
  const target = port(state, session.harnessId);
  const capability = currentOnly ? "input.cancel-current" : "input.cancel";
  if (
    !target.port.cancel ||
    !target.descriptor.capabilities.includes(capability)
  )
    throw new Error("Input cancellation unsupported");
  const epoch = state.sources.get(id)!;
  state.cancelPending.add(id);
  let result: CancelOutcome;
  try {
    result = cancelOutcome(
      await target.port.cancel(id, inputId, () => writeGuard(state, id, epoch)),
    );
  } catch {
    result = { kind: "uncertain" };
  }
  state.cancelPending.delete(id);
  if (!writeGuard(state, id, epoch)) {
    holdUncertain(state, id, inputId);
    return { kind: "uncertain" };
  }
  if (state.inputs.get(id)?.inputId !== inputId) return result;
  if (result.kind === "accepted") state.cancelAccepted.add(id);
  if (result.kind === "uncertain") setInput(state, id, inputId, "uncertain");
  return result;
}
