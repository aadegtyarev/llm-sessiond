import {
  ControlPlaneError,
  type ControlPlaneErrorCode,
} from "./control-plane-error.js";
import type { InputFailureReason } from "./execution-input-port.js";

export class InputRuntimeError extends ControlPlaneError {
  constructor(
    code: ControlPlaneErrorCode,
    readonly inputId: string,
    readonly resumed: boolean,
    readonly failureReason?: InputFailureReason | undefined,
  ) {
    super(code);
  }
}
