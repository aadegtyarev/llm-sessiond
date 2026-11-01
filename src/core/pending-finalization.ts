import type { LifecycleExecution } from "./lifecycle-execution.js";
export type FinalStatus = "failed" | "stopped";
export interface PendingFinalization {
  status: FinalStatus;
  reason: string | null;
  at: string | null;
  execution?: LifecycleExecution;
  stopRequired: boolean;
}
