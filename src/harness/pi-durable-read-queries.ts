import type { ChildProcess } from "node:child_process";
import type { PiDurableRpcLink } from "./pi-durable-rpc-link.js";
import { readPiLiveStatus } from "./pi-live-status-query.js";
import { readPiModelCatalog } from "./pi-model-catalog-query.js";

export function isDurablePiQueryCurrent(
  currentLink: PiDurableRpcLink | undefined,
  link: PiDurableRpcLink,
  child: ChildProcess | undefined,
  stopRequested: boolean,
  stopped: boolean,
): boolean {
  return (
    currentLink === link &&
    !stopRequested &&
    !stopped &&
    child?.exitCode === null &&
    child.signalCode === null
  );
}
export function readDurablePiLiveStatus(
  link: PiDurableRpcLink,
  nativeSessionId: string | undefined,
  isCurrent: () => boolean,
) {
  return readPiLiveStatus(link, nativeSessionId, isCurrent);
}
export function readDurablePiModelCatalog(
  link: PiDurableRpcLink | undefined,
  isCurrent: (link: PiDurableRpcLink) => boolean,
) {
  if (!link) throw new Error("RPC_UNAVAILABLE");
  return readPiModelCatalog(link, () => isCurrent(link));
}
