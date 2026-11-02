import type { InputCommandOutcome } from "../core/execution-input-port.js";
import type { InputImage } from "../core/input-validation.js";
import type { PiDurableRpcLink } from "./pi-durable-rpc-link.js";
import type { PiDurableCurrentInput } from "./pi-durable-input-cancel.js";
import type { PiDurableInputEvent } from "./pi-durable-input-event.js";

export async function submitPiCurrent(
  current: PiDurableCurrentInput,
  input: { inputId: string; text: string; images?: InputImage[] },
  link: PiDurableRpcLink,
  isDead: () => boolean,
  isCurrent: () => boolean,
  rejectCurrent: () => void,
  publish: (event: PiDurableInputEvent) => void,
): Promise<InputCommandOutcome> {
  const images = input.images?.length
    ? input.images.map(({ mimeType, data }) => ({
        type: "image",
        mimeType,
        data,
      }))
    : undefined;
  try {
    const reply = await link.command("prompt", {
      message: input.text,
      ...(images ? { images } : {}),
      streamingBehavior: "steer",
    });
    if (reply.success !== true) {
      if (isDead()) return { kind: "uncertain" };
      if (isCurrent()) rejectCurrent();
      publish({
        inputId: input.inputId,
        state: "failed",
        reason: "prompt_rejected",
      });
      return { kind: "rejected", reason: "prompt_rejected" };
    }
    if (isDead()) return { kind: "uncertain" };
    if (isCurrent()) current.accepted = true;
    return { kind: "accepted" };
  } catch {
    return { kind: "uncertain" };
  }
}
