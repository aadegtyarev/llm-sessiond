import type { ChildProcess } from "node:child_process";
import { RpcLink } from "./rpc-link.js";
import { PiRpcProcess } from "./pi-process.js";

export async function startPiProcess(
  child: ChildProcess,
  expectedId?: string,
): Promise<PiRpcProcess> {
  const rpc = new RpcLink(child);
  try {
    const state = await rpc.command("get_state");
    if (state.success !== true) throw new Error("PI_GET_STATE_FAILED");
    const nativeId = (state.data as Record<string, unknown> | undefined)
      ?.sessionId;
    if (
      typeof nativeId !== "string" ||
      !nativeId ||
      (expectedId !== undefined && expectedId !== nativeId)
    )
      throw new Error("PI_SESSION_ID_MISMATCH");
    rpc.dispose();
    return new PiRpcProcess(child, nativeId);
  } catch (error) {
    rpc.dispose();
    child.kill();
    throw error;
  }
}
