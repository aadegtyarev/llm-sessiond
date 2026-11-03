import type {
  HarnessPort,
  SubmitOutcome,
} from "../interfaces/runtime-ports.js";
import type { PiProcess } from "./pi-process.js";

export async function submitPiInput(
  process: PiProcess,
  input: Parameters<HarnessPort["submit"]>[1],
  beforeWrite: () => boolean,
): Promise<SubmitOutcome> {
  if (!isPiProcessCurrent(process) || process.activeInput)
    return { kind: "uncertain" };
  process.activeInput = input.inputId;
  process.abortAccepted = false;
  const images = input.images?.map(({ mimeType, data }) => ({
    type: "image",
    mimeType,
    data,
  }));
  try {
    const reply = await process.rpc.command(
      "prompt",
      {
        message: input.text,
        streamingBehavior: "steer",
        ...(images?.length ? { images } : {}),
      },
      process.rpcTimeoutMs,
      () => beforeWrite() && isPiProcessCurrent(process),
    );
    if (reply.success === true)
      return isPiProcessCurrent(process)
        ? { kind: "accepted" }
        : { kind: "uncertain" };
    process.activeInput = undefined;
    return isPiProcessCurrent(process)
      ? { kind: "rejected", reason: "prompt_rejected" }
      : { kind: "uncertain" };
  } catch {
    return { kind: "uncertain" };
  }
}
export function settledPiInput(process: PiProcess): string | undefined {
  const inputId = process.activeInput;
  process.activeInput = undefined;
  if (inputId && process.abortPendingInput === inputId)
    process.settledDuringAbort = true;
  return inputId;
}
export function isPiProcessCurrent(process: PiProcess): boolean {
  return (
    process.rpc.writable &&
    !process.stopRequested &&
    !process.stopped &&
    process.child.exitCode === null &&
    process.child.signalCode === null
  );
}
