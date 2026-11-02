import type { EffortChangeCallContext } from "../core/effort-change-port.js";
import type { PiDurableRpcLink } from "./pi-durable-rpc-link.js";
import { readPiEffortCatalog } from "./pi-effort-catalog-query.js";
import {
  piEffortRpcTimeout,
  readPiEffortState,
  readPiBoolean,
} from "./pi-durable-effort-state.js";

export async function changePiEffort(
  link: PiDurableRpcLink | undefined,
  nativeSessionId: string | undefined,
  level: string,
  context: EffortChangeCallContext,
): Promise<{ outcome: "applied" }> {
  if (
    !link ||
    !link.writable ||
    !context.isCurrent() ||
    !nativeSessionId ||
    context.expectedNativeSessionId !== nativeSessionId
  )
    throw new Error("RPC_UNAVAILABLE");
  const catalog = await readPiEffortCatalog(
    link,
    () => context.isCurrent(),
    () => piEffortRpcTimeout(context),
  );
  const before = await readPiEffortState(link, context);
  if (before.sessionId !== nativeSessionId)
    throw new Error("SESSION_ID_MISMATCH");
  if (!catalog.levels.some((available) => available === level))
    throw new Error("UNSUPPORTED_EFFORT");
  const setter = await link.command(
    "set_thinking_level",
    { level },
    piEffortRpcTimeout(context),
    () => context.beforeMutationWrite(),
  );
  if (readPiBoolean(setter, "success") !== true)
    throw new Error("INVALID_SETTER_ACK");
  const after = await readPiEffortState(link, context);
  if (after.sessionId !== nativeSessionId || after.thinkingLevel !== level)
    throw new Error("EFFORT_READBACK_MISMATCH");
  return { outcome: "applied" };
}
