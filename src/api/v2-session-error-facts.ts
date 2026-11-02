import { ApiError } from "../core/api-error.js";
import { ControlPlaneError } from "../core/control-plane-error.js";
import type { ControlPlaneErrorCode } from "../core/control-plane-error.js";

const ALLOWED_CODES = new Set<ControlPlaneErrorCode>([
  "NOT_FOUND",
  "SESSION_ID_COLLISION",
  "UNSUPPORTED_CAPABILITY",
  "INVALID_CWD",
  "INVALID_OPTIONS",
  "INVALID_SESSION_ID",
  "UNKNOWN_ADAPTER",
]);
export function controlPlaneCode(
  error: unknown,
): ControlPlaneErrorCode | undefined {
  try {
    if (!(error instanceof ControlPlaneError)) return undefined;
    const property = Object.getOwnPropertyDescriptor(error, "code");
    if (
      !property ||
      !("value" in property) ||
      typeof property.value !== "string"
    )
      return undefined;
    return ALLOWED_CODES.has(property.value as ControlPlaneErrorCode)
      ? (property.value as ControlPlaneErrorCode)
      : undefined;
  } catch {
    return undefined;
  }
}
export function isPayloadTooLarge(error: unknown): boolean {
  try {
    if (!(error instanceof ApiError)) return false;
    const property = Object.getOwnPropertyDescriptor(error, "status");
    return Boolean(property && "value" in property && property.value === 413);
  } catch {
    return false;
  }
}
