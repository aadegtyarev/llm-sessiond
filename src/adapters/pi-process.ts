import type { ChildProcess } from "node:child_process";
import type { ProcessProvider } from "../core/ports.js";
import { PiRpcClient } from "./pi-rpc-client.js";

export interface PiProcess {
  child: ChildProcess;
  rpc: PiRpcClient;
  rpcTimeoutMs: number;
  nativeSessionId: string;
  ready: boolean;
  activeInput: string | undefined;
  abortAccepted: boolean;
  abortPendingInput: string | undefined;
  settledDuringAbort: boolean;
  publishSettlement: ((inputId: string) => void) | undefined;
  stopRequested: boolean;
  stopped: boolean;
  stopping: Promise<boolean> | undefined;
}
export async function stopPiProcess(
  process: PiProcess,
  timeoutMs = 2_000,
): Promise<boolean> {
  process.stopRequested = true;
  process.rpc.close();
  if (process.stopped || exited(process.child)) {
    process.stopped = true;
    process.rpc.dispose();
    process.publishSettlement = undefined;
    return true;
  }
  if (process.stopping) return process.stopping;
  process.stopping = (async () => {
    process.child.kill("SIGTERM");
    if (
      !(await confirmExit(process.child, timeoutMs)) &&
      !exited(process.child)
    ) {
      process.child.kill("SIGKILL");
      if (!(await confirmExit(process.child, timeoutMs))) return false;
    }
    process.stopped = true;
    process.rpc.dispose();
    process.publishSettlement = undefined;
    return true;
  })().finally(() => {
    process.stopping = undefined;
  });
  return process.stopping;
}
function exited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}
function confirmExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (exited(child)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const finish = (): void => {
      clearTimeout(timer);
      child.off("exit", finish);
      resolve(true);
    };
    const timer = setTimeout(() => {
      child.off("exit", finish);
      resolve(exited(child));
    }, timeoutMs);
    child.once("exit", finish);
  });
}
export async function launchPiProcess(
  provider: ProcessProvider,
  executable: string,
  cwd: string,
  args: string[],
  rpcTimeoutMs: number,
  beforeWrite: () => boolean,
): Promise<PiProcess | undefined> {
  const launch = provider.launch;
  const launchArgs = ["--mode", "rpc", ...args];
  if (!beforeWrite()) return undefined;
  const child = Reflect.apply(launch, provider, [executable, launchArgs, cwd]);
  return {
    child,
    rpc: new PiRpcClient(child, rpcTimeoutMs),
    rpcTimeoutMs,
    nativeSessionId: "",
    ready: false,
    activeInput: undefined,
    abortAccepted: false,
    abortPendingInput: undefined,
    settledDuringAbort: false,
    publishSettlement: undefined,
    stopRequested: false,
    stopped: false,
    stopping: undefined,
  };
}
