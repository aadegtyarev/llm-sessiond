import type { RuntimeState } from "./runtime-state.js";
import { current, port, read } from "./store-access.js";
import { writeGuard } from "./runtime-support.js";
import { sessionId } from "./session-records.js";

export async function changeEffort(
  state: RuntimeState,
  id: string,
  level: string,
): Promise<"applied" | "not-applied" | "unknown"> {
  if (!current(state)) throw new Error("Runtime unavailable");
  id = sessionId(id);
  if (typeof level !== "string" || state.closing) return "not-applied";
  const session = read(state, id);
  if (!session || session.status !== "running" || state.stopping.has(id))
    return "not-applied";
  const target = port(state, session.harnessId);
  if (
    !target.port.changeEffort ||
    !target.descriptor.capabilities.includes("effort.change")
  )
    throw new Error("Effort change unsupported");
  const epoch = state.sources.get(id)!;
  let outcome: "applied" | "not-applied" | "unknown";
  try {
    outcome = await target.port.changeEffort(id, level, () =>
      writeGuard(state, id, epoch),
    );
  } catch {
    outcome = "unknown";
  }
  return writeGuard(state, id, epoch) ? outcome : "unknown";
}
