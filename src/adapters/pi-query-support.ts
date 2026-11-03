import type { PiProcess } from "./pi-process.js";

export function assertPiQueryCurrent(process: PiProcess): void {
  if (
    !process.rpc.writable ||
    process.stopRequested ||
    process.stopped ||
    process.child.exitCode !== null ||
    process.child.signalCode !== null
  )
    throw new Error("Query unavailable");
}
export async function queryPiData(
  process: PiProcess,
  type: string,
): Promise<Record<string, unknown>> {
  assertPiQueryCurrent(process);
  const reply = await process.rpc.command(type);
  assertPiQueryCurrent(process);
  if (
    reply.success !== true ||
    !reply.data ||
    typeof reply.data !== "object" ||
    Array.isArray(reply.data)
  )
    throw new Error("Query unavailable");
  return reply.data as Record<string, unknown>;
}
