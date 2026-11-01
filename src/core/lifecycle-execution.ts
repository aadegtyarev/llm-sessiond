import type { AdapterCheckpoint, HarnessAdapter } from "./adapter-contracts.js";
import type { JsonValue } from "./generic-json.js";

export interface LifecycleLaunchResult {
  nativeSessionId?: string;
  checkpoint?: AdapterCheckpoint;
}
export interface LifecycleExecution {
  launch(input: {
    cwd: string;
    options?: JsonValue;
  }): Promise<LifecycleLaunchResult>;
  resume(input: {
    checkpoint?: AdapterCheckpoint;
    nativeSessionId?: string;
  }): Promise<LifecycleLaunchResult>;
  stop(): Promise<void>;
}
export interface LifecycleExecutionFactory {
  create(adapter: HarnessAdapter): LifecycleExecution;
}
