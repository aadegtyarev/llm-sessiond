import type { EffortChangeCallContext } from "../core/effort-change-port.js";
import type { PiDurableRpcLink } from "./pi-durable-rpc-link.js";

const RPC_TIMEOUT_MS = 15_000;

export function piEffortRpcTimeout(context: EffortChangeCallContext): number {
  return Math.max(1, Math.min(RPC_TIMEOUT_MS, context.remainingMs()));
}
export async function readPiEffortState(
  link: PiDurableRpcLink,
  context: EffortChangeCallContext,
): Promise<{ sessionId: string; thinkingLevel?: string }> {
  if (!link.writable || !context.isCurrent())
    throw new Error("RPC_UNAVAILABLE");
  const response = await link.command(
    "get_state",
    {},
    piEffortRpcTimeout(context),
    () => context.isCurrent(),
  );
  const data = readRecord(response, "data");
  const sessionId = readString(data, "sessionId");
  const thinkingLevel = readOptionalString(data, "thinkingLevel");
  if (sessionId === undefined || thinkingLevel === null)
    throw new Error("INVALID_STATE");
  return {
    sessionId,
    ...(thinkingLevel === undefined ? {} : { thinkingLevel }),
  };
}
function readRecord(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  if (readPiBoolean(value, "success") !== true)
    throw new Error("INVALID_STATE");
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !("value" in descriptor)) throw new Error("INVALID_STATE");
  const data = descriptor.value;
  if (typeof data !== "object" || data === null || Array.isArray(data))
    throw new Error("INVALID_STATE");
  return data as Record<string, unknown>;
}
export function readPiBoolean(
  value: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor &&
    "value" in descriptor &&
    typeof descriptor.value === "boolean"
    ? descriptor.value
    : undefined;
}
function readString(
  value: Record<string, unknown>,
  key: string,
): string | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor &&
    "value" in descriptor &&
    typeof descriptor.value === "string"
    ? descriptor.value
    : undefined;
}
function readOptionalString(
  value: Record<string, unknown>,
  key: string,
): string | undefined | null {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) return undefined;
  return "value" in descriptor && typeof descriptor.value === "string"
    ? descriptor.value
    : null;
}
