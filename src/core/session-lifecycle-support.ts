import { ControlPlaneError } from "./control-plane-error.js";
import type { DurableManagerContext } from "./durable-manager-context.js";
import type { DurableSession } from "../persistence/session-record.js";
import type { LifecycleExecution } from "./lifecycle-execution.js";
import type { HarnessAdapter } from "./adapter-contracts.js";
import { validateCheckpoint } from "./adapter-checkpoint.js";
import type { HarnessRegistry } from "./adapter-registry.js";
export function assertExecutionAdmissionOpen(
  context: DurableManagerContext,
): void {
  if (context.executionAdmissionClosed)
    throw new ControlPlaneError("SESSION_UNAVAILABLE");
}
export function assertCurrentOwner(context: DurableManagerContext): void {
  try {
    context.store.assertOwner(context.owner);
  } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    throw new ControlPlaneError("STORE_FAILED");
  }
}
export function resolveAdapter(registry: HarnessRegistry, id?: string) {
  try {
    return registry.resolve(id);
  } catch {
    throw new ControlPlaneError("UNKNOWN_ADAPTER");
  }
}
export function requireCapability(
  adapter: { descriptor: { capabilities: string[] } },
  name: string,
): void {
  if (!adapter.descriptor.capabilities.includes(name))
    throw new ControlPlaneError("UNSUPPORTED_CAPABILITY");
}
export function checkedCheckpoint(
  adapter: HarnessAdapter,
  value: DurableSession["adapterState"],
) {
  return value ? validateCheckpoint(value, adapter) : undefined;
}
export interface CapturedLifecycleResult {
  nativeSessionId?: string;
  checkpoint?: DurableSession["adapterState"];
}
export function captureLifecycleResult(
  adapter: HarnessAdapter,
  row: DurableSession,
  result: {
    nativeSessionId?: string;
    checkpoint?: DurableSession["adapterState"];
  },
): CapturedLifecycleResult {
  const nativeSessionId = result.nativeSessionId ?? row.nativeSessionId;
  const checkpoint =
    checkedCheckpoint(adapter, result.checkpoint) ?? row.adapterState;
  return {
    ...(nativeSessionId !== undefined ? { nativeSessionId } : {}),
    ...(checkpoint ? { checkpoint: structuredClone(checkpoint) } : {}),
  };
}
export function markRunning(
  context: DurableManagerContext,
  row: DurableSession,
  execution: LifecycleExecution,
  result: CapturedLifecycleResult,
): void {
  context.store.updateExecution(
    row.id,
    result.nativeSessionId,
    result.checkpoint,
    context.owner,
  );
  assertExecutionAdmissionOpen(context);
  context.store.setStatus(row.id, "running", null, null);
  context.owned.set(row.id, execution);
}
