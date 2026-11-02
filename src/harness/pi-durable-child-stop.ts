import type { ChildProcess } from "node:child_process";
import type { ChildTerminator } from "../process/child-stop.js";
import { terminateChild } from "../process/terminate-child.js";
import type { PiDurableRpcLink } from "./pi-durable-rpc-link.js";

export function stopPiChildTracked(
  child: ChildProcess,
  link: PiDurableRpcLink | undefined,
  terminate: ChildTerminator | undefined,
  pending: Promise<void> | undefined,
  setPending: (value: Promise<void> | undefined) => void,
  onStopped: () => void,
): Promise<void> {
  if (pending) return pending;
  const attempt = stopPiChild(child, link, terminate).then(
    onStopped,
    (error: unknown) => {
      setPending(undefined);
      throw error;
    },
  );
  setPending(attempt);
  return attempt;
}
export async function stopPiChild(
  child: ChildProcess,
  link: PiDurableRpcLink | undefined,
  terminate?: ChildTerminator,
): Promise<void> {
  await (terminate ?? terminateChild)(child);
  if (child.exitCode === null && child.signalCode === null)
    throw new Error("STOP_UNCONFIRMED");
  link?.dispose();
}
