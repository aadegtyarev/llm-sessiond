import type { AdapterCheckpoint } from "../core/adapter-contracts.js";
import type { JsonValue } from "../core/generic-json.js";

export type DurableStatus =
  "starting" | "running" | "stopped" | "failed" | "uncertain";
export interface DurableSession {
  id: string;
  harnessId: string;
  cwd: string;
  status: DurableStatus;
  name?: string;
  nativeSessionId?: string;
  adapterOptions?: JsonValue;
  adapterState?: AdapterCheckpoint;
  failureReason?: string;
  failedAt?: string;
  createdAt: string;
}
export interface OwnerGeneration {
  token: string;
  generation: number;
}
