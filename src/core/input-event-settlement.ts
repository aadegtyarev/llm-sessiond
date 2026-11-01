import type { InputFailureReason } from "./execution-input-port.js";
import type { InputOperation } from "./durable-input-state.js";
import type { ManagedInputEvent } from "./input-runtime-events.js";

const REASONS = new Set<InputFailureReason>([
  "prompt_rejected",
  "hold_timeout",
  "held_and_stopped",
  "canceled",
]);
export function subscribeInputEvents(
  operation: InputOperation,
  subscribe: ((listener: (event: unknown) => void) => () => void) | undefined,
  isCurrent: (operation: InputOperation) => boolean,
  settle: (
    state: ManagedInputEvent["state"],
    reason?: InputFailureReason,
  ) => void,
): (() => void) | undefined {
  return subscribe?.((value) => {
    if (!isCurrent(operation) || !value || typeof value !== "object") return;
    const event = value as Record<string, unknown>;
    if (
      Object.keys(event).some(
        (key) => !["inputId", "state", "reason"].includes(key),
      ) ||
      event.inputId !== operation.id
    )
      return;
    if (
      !["accepted", "completed", "failed", "uncertain"].includes(
        String(event.state),
      )
    )
      return;
    if (
      event.reason !== undefined &&
      (typeof event.reason !== "string" ||
        !REASONS.has(event.reason as InputFailureReason))
    )
      return;
    if (event.state === "accepted" && operation.state !== "pending") return;
    if (event.state === "failed" && event.reason === undefined) return;
    settle(
      event.state as ManagedInputEvent["state"],
      event.reason as InputFailureReason | undefined,
    );
  });
}
