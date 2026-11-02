import type { ControlPlaneErrorCode } from "./control-plane-error.js";
import { ControlPlaneError } from "./control-plane-error.js";
import type { EffortChangeOutcome } from "./effort-change-port.js";

export class EffortChangeError extends ControlPlaneError {
  constructor(
    code: ControlPlaneErrorCode,
    readonly outcome: Exclude<EffortChangeOutcome, "applied">,
  ) {
    super(code);
    this.name = "EffortChangeError";
  }
}
