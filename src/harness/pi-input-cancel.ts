import type { RpcLink } from "./rpc-link.js";

export interface CancelState {
  canCancel(): boolean;
  begin(): void;
  uncertain(): void;
  rejected(): void;
  canceled(): void;
}
export async function cancelPiInput(
  link: RpcLink,
  inputId: string,
  state: CancelState,
  emit: (type: string, data: Record<string, unknown>) => void,
): Promise<void> {
  if (!state.canCancel()) throw new Error("INPUT_NOT_CANCELLABLE");
  state.begin();
  let response: Record<string, unknown>;
  try {
    response = await link.command("abort");
  } catch {
    state.uncertain();
    emit("input.state", {
      inputId,
      state: "uncertain",
      reason: "abort response was not received",
    });
    throw new Error("ABORT_UNCERTAIN");
  }
  if (response.success !== true) {
    state.rejected();
    throw new Error("PI_ABORT_REJECTED");
  }
  state.canceled();
}
