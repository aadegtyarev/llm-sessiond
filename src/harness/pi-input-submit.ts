import { randomUUID } from "node:crypto";
import type { ImageInput } from "../core/types.js";
import type { RpcLink } from "./rpc-link.js";

export interface SubmitState {
  busy(): boolean;
  begin(id: string): void;
  accepted(): void;
  rejected(): void;
  uncertain(): void;
}
export async function submitPiInput(
  link: RpcLink,
  text: string,
  images: ImageInput[] | undefined,
  state: SubmitState,
  emit: (type: string, data: Record<string, unknown>) => void,
): Promise<string> {
  if (state.busy()) throw new Error("SESSION_INPUT_BUSY");
  const inputId = randomUUID();
  state.begin(inputId);
  emit("input.state", { inputId, state: "pending" });
  try {
    const response = await link.command("prompt", {
      message: text,
      ...(images?.length
        ? {
            images: images.map((image) => ({
              type: "image",
              mimeType: image.mimeType,
              data: image.data,
            })),
          }
        : {}),
      streamingBehavior: "steer",
    });
    if (response.success !== true) {
      state.rejected();
      throw new Error("PI_PROMPT_REJECTED");
    }
    state.accepted();
    return inputId;
  } catch (error) {
    if ((error as Error).message === "PI_PROMPT_REJECTED") throw error;
    state.uncertain();
    emit("input.state", {
      inputId,
      state: "uncertain",
      reason: "prompt response was not received",
    });
    throw new Error("INPUT_DELIVERY_UNCERTAIN", { cause: error });
  }
}
