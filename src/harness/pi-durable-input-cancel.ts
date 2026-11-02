import type { InputCancelOutcome } from "../core/execution-input-port.js";
import type { PiDurableRpcLink } from "./pi-durable-rpc-link.js";

export type PiDurableCurrentInput = {
  id: string;
  accepted: boolean;
  canceling: boolean;
  settled: boolean;
  abortAccepted: boolean;
  abortUncertain: boolean;
};

export async function cancelPiCurrent(
  current: PiDurableCurrentInput | undefined,
  inputId: string,
  link: PiDurableRpcLink | undefined,
  isDead: () => boolean,
  settled?: () => void,
): Promise<InputCancelOutcome> {
  if (
    isDead() ||
    !link?.writable ||
    !current ||
    current.id !== inputId ||
    !current.accepted ||
    current.canceling ||
    current.abortUncertain
  )
    return { kind: "uncertain" };
  current.canceling = true;
  try {
    const reply = await link.command("abort", {});
    current.canceling = false;
    if (isDead()) {
      current.abortUncertain = true;
      return { kind: "uncertain" };
    }
    if (current.settled) settled?.();
    current.abortAccepted = reply.success === true;
    if (reply.success !== true) current.abortUncertain = false;
    return reply.success === true ? { kind: "accepted" } : { kind: "rejected" };
  } catch {
    current.canceling = false;
    current.abortUncertain = true;
    if (current.settled) settled?.();
    return { kind: "uncertain" };
  }
}
