import type { InputFailureReason } from "./execution-input-port.js";

export type NormalizedInputEvent =
  | { kind: "execution-ended" }
  | {
      kind: "input";
      inputId: string;
      state: "accepted" | "completed" | "failed" | "uncertain";
      reason?: InputFailureReason;
    };
const STATES = new Set(["accepted", "completed", "failed", "uncertain"]);
const REASONS = new Set<InputFailureReason>([
  "prompt_rejected",
  "hold_timeout",
  "held_and_stopped",
  "canceled",
]);
export function normalizeInputEvent(
  value: unknown,
): NormalizedInputEvent | undefined {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return undefined;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype) return undefined;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== "string")) return undefined;
    const keys = ownKeys as string[];
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (keys.some((key) => !("value" in descriptors[key]!))) return undefined;
    const field = (key: string) => descriptors[key]?.value as unknown;
    if (field("kind") === "execution-ended" && keys.length === 1)
      return { kind: "execution-ended" };
    if (keys.some((key) => !["inputId", "state", "reason"].includes(key)))
      return undefined;
    const inputId = field("inputId");
    const state = field("state");
    const reason = field("reason");
    if (
      typeof inputId !== "string" ||
      typeof state !== "string" ||
      !STATES.has(state)
    )
      return undefined;
    if (
      reason !== undefined &&
      (typeof reason !== "string" || !REASONS.has(reason as InputFailureReason))
    )
      return undefined;
    if (state === "failed" && reason === undefined) return undefined;
    return {
      kind: "input",
      inputId,
      state: state as "accepted" | "completed" | "failed" | "uncertain",
      ...(reason ? { reason: reason as InputFailureReason } : {}),
    };
  } catch {
    return undefined;
  }
}
