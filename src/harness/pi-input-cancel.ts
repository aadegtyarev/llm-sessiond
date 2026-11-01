import type { RpcLink } from "./rpc-link.js";

export interface CancelState {
  canCancel(inputId: string): boolean;
  beginCancel(): void;
  uncertain(): boolean;
  abortRejected(): void;
  acknowledged(): void;
}
export async function cancelPiInput(
  link: RpcLink,
  inputId: string,
  state: CancelState,
  emit: (type: string, data: Record<string, unknown>) => void,
): Promise<void> {
  if (!state.canCancel(inputId)) throw new Error("INPUT_NOT_CANCELLABLE");
  state.beginCancel();
  let response: Record<string, unknown>;
  try {
    response = await link.command("abort");
  } catch {
    if (state.uncertain())
      emit("input.state", {
        inputId,
        state: "uncertain",
        reason: "abort response was not received",
      });
    throw new Error("ABORT_UNCERTAIN");
  }
  if (response.success !== true) {
    state.abortRejected();
    throw new Error("PI_ABORT_REJECTED");
  }
  state.acknowledged();
}
