import type { PiDurableRpcLink } from "./pi-durable-rpc-link.js";

export async function startDurablePi(
  link: PiDurableRpcLink,
  expectedId?: string,
  timeoutMs = 15_000,
): Promise<string> {
  const state = await link.command("get_state", {}, timeoutMs);
  const nativeId = (state.data as Record<string, unknown> | undefined)
    ?.sessionId;
  if (
    state.success !== true ||
    typeof nativeId !== "string" ||
    !nativeId ||
    (expectedId !== undefined && expectedId !== nativeId)
  ) {
    throw new Error("PI_STARTUP_FAILED");
  }
  return nativeId;
}
