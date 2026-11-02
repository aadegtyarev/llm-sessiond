import type { PiDurableRpcLink } from "./pi-durable-rpc-link.js";
import { startDurablePi } from "./pi-durable-startup.js";

export async function startOwnedPi(
  link: PiDurableRpcLink,
  expectedId: string | undefined,
  timeoutMs: number,
  stop: () => Promise<void>,
): Promise<string> {
  try {
    return await startDurablePi(link, expectedId, timeoutMs);
  } catch {
    try {
      await stop();
    } catch {
      /* Ownership remains until a confirmed retry. */
    }
    throw new Error("PI_STARTUP_FAILED");
  }
}
