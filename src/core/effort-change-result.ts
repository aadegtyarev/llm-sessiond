import type { EffortChangeOutcome } from "./effort-change-port.js";

export function readEffortChangeOutcome(
  value: unknown,
): EffortChangeOutcome | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return undefined;
  try {
    if (Object.getPrototypeOf(value) !== Object.prototype) return undefined;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== 1 || keys[0] !== "outcome") return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, "outcome");
    if (!descriptor || !("value" in descriptor)) return undefined;
    return descriptor.value === "applied" || descriptor.value === "not-applied"
      ? descriptor.value
      : undefined;
  } catch {
    return undefined;
  }
}
