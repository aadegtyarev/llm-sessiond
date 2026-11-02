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
  if (!current || current.id !== inputId || !current.accepted)
    return { kind: "uncertain" };
  if (isDead() || !link?.writable) return { kind: "uncertain" };
  if (current.settled) return { kind: "rejected" };
  if (current.abortAccepted) return { kind: "accepted" };
  if (current.canceling || current.abortUncertain) return { kind: "uncertain" };
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
