import type { ChildProcess } from "node:child_process";

function exited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}
function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (exited(child)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const finish = (done: boolean): void => {
      clearTimeout(timer);
      child.removeListener("exit", onExit);
      child.removeListener("close", onExit);
      resolve(done);
    };
    const onExit = (): void => finish(true);
    const timer = setTimeout(() => finish(exited(child)), timeoutMs);
    child.once("exit", onExit);
    child.once("close", onExit);
  });
}
export async function terminateChild(
  child: ChildProcess,
  graceMs = 2000,
): Promise<void> {
  if (await waitForExit(child, 0)) return;
  child.kill("SIGTERM");
  if (await waitForExit(child, graceMs)) return;
  child.kill("SIGKILL");
  await waitForExit(child, graceMs);
}
