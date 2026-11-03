import type { PiProcess } from "./pi-process.js";

export const PI_CHECKPOINT_NAMESPACE = "pi.session";
export const PI_CHECKPOINT_VERSION = 1;
export function readPiCheckpoint(value: unknown): string | undefined {
  if (
    !plainRecord(value) ||
    !exactKeys(value, ["namespace", "version", "data"])
  )
    return undefined;
  const namespace = ownValue(value, "namespace");
  const version = ownValue(value, "version");
  const data = ownValue(value, "data");
  if (
    namespace !== PI_CHECKPOINT_NAMESPACE ||
    version !== PI_CHECKPOINT_VERSION ||
    !plainRecord(data) ||
    !exactKeys(data, ["sessionId"])
  )
    return undefined;
  const sessionId = ownValue(data, "sessionId");
  return typeof sessionId === "string" &&
    sessionId.length > 0 &&
    sessionId.length <= 4096
    ? sessionId
    : undefined;
}
function plainRecord(value: unknown): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}
function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return (
    Reflect.ownKeys(value).length === keys.length &&
    keys.every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return !!descriptor && "value" in descriptor;
    })
  );
}
function ownValue(value: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}
export async function readyPi(
  process: PiProcess,
  expected?: string,
  timeoutMs = 15_000,
): Promise<string> {
  const reply = await process.rpc.command("get_state", {}, timeoutMs);
  if (
    reply.success !== true ||
    !process.rpc.writable ||
    process.child.exitCode !== null ||
    process.child.signalCode !== null ||
    !reply.data ||
    typeof reply.data !== "object" ||
    Array.isArray(reply.data)
  )
    throw new Error("PI_STARTUP_FAILED");
  const nativeId = (reply.data as Record<string, unknown>).sessionId;
  if (
    typeof nativeId !== "string" ||
    !nativeId ||
    (expected !== undefined && nativeId !== expected)
  )
    throw new Error("PI_STARTUP_FAILED");
  process.nativeSessionId = nativeId;
  return nativeId;
}
export function piCheckpoint(sessionId: string) {
  return {
    namespace: PI_CHECKPOINT_NAMESPACE,
    version: PI_CHECKPOINT_VERSION,
    data: { sessionId },
  };
}
