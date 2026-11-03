import type { CancelOutcome } from "../interfaces/runtime-ports.js";
import { isPiProcessCurrent } from "./pi-input.js";
import type { PiProcess } from "./pi-process.js";

export async function cancelPiInput(
  process: PiProcess,
  inputId: string,
  beforeWrite: () => boolean,
): Promise<CancelOutcome> {
  if (
    !isPiProcessCurrent(process) ||
    process.activeInput !== inputId ||
    process.abortAccepted
  )
    return { kind: "rejected" };
  try {
    const reply = await process.rpc.command(
      "abort",
      {},
      process.rpcTimeoutMs,
      () => {
        if (
          !beforeWrite() ||
          !isPiProcessCurrent(process) ||
          process.activeInput !== inputId ||
          process.abortAccepted
        )
          return false;
        process.abortPendingInput = inputId;
        process.settledDuringAbort = false;
        return true;
      },
      (record) => {
        if (process.settledDuringAbort) return;
        process.abortPendingInput = undefined;
        if (record.success === true) process.abortAccepted = true;
      },
    );
    if (releaseAbort(process, inputId)) {
      process.publishSettlement?.(inputId);
      return { kind: "rejected" };
    }
    if (reply.success !== true)
      return isPiProcessCurrent(process)
        ? { kind: "rejected" }
        : { kind: "uncertain" };
    return { kind: "accepted" };
  } catch {
    if (releaseAbort(process, inputId)) process.publishSettlement?.(inputId);
    return { kind: "uncertain" };
  }
}
function releaseAbort(process: PiProcess, inputId: string): boolean {
  if (process.abortPendingInput !== inputId) return false;
  process.abortPendingInput = undefined;
  const settled = process.settledDuringAbort;
  process.settledDuringAbort = false;
  return settled;
}
