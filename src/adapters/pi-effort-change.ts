import type { PiProcess } from "./pi-process.js";

export async function changePiEffort(
  process: PiProcess,
  level: string,
  beforeWrite: () => boolean,
): Promise<"applied" | "not-applied" | "unknown"> {
  let wrote = false;
  try {
    assertCurrent(process);
    const catalog = await process.rpc.command("get_available_thinking_levels");
    const state = await process.rpc.command("get_state");
    assertCurrent(process);
    const levels = (catalog.data as Record<string, unknown> | undefined)
      ?.levels;
    const native = state.data as Record<string, unknown> | undefined;
    if (
      catalog.success !== true ||
      !Array.isArray(levels) ||
      levels.some((item) => typeof item !== "string") ||
      state.success !== true ||
      native?.sessionId !== process.nativeSessionId
    )
      return "not-applied";
    if (!levels.includes(level) || !beforeWrite()) return "not-applied";
    const changed = await process.rpc.command(
      "set_thinking_level",
      { level },
      process.rpcTimeoutMs,
      () => {
        if (!beforeWrite() || !isCurrent(process)) return false;
        wrote = true;
        return true;
      },
    );
    if (changed.success !== true) return wrote ? "unknown" : "not-applied";
    const readback = await process.rpc.command("get_state");
    assertCurrent(process);
    const actual = readback.data as Record<string, unknown> | undefined;
    return readback.success === true &&
      actual?.sessionId === process.nativeSessionId &&
      actual.thinkingLevel === level
      ? "applied"
      : "unknown";
  } catch {
    return wrote ? "unknown" : "not-applied";
  }
}
function isCurrent(process: PiProcess): boolean {
  return (
    process.rpc.writable &&
    !process.stopRequested &&
    !process.stopped &&
    process.child.exitCode === null &&
    process.child.signalCode === null
  );
}
function assertCurrent(process: PiProcess): void {
  if (!isCurrent(process)) throw new Error("Query unavailable");
}
