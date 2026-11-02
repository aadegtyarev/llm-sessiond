import type { AdapterCheckpoint, HarnessAdapter } from "./adapter-contracts.js";
import type { JsonValue } from "./generic-json.js";
import type { ExecutionInputPort } from "./execution-input-port.js";
import type { LiveStatusExecutionPort } from "./live-status.js";
import type { ModelCatalogExecutionPort } from "./model-catalog.js";
import type { EffortCatalogExecutionPort } from "./effort-catalog.js";
import type { CommandCatalogExecutionPort } from "./command-catalog.js";

export interface LifecycleLaunchResult {
  nativeSessionId?: string;
  checkpoint?: AdapterCheckpoint;
}
export interface LifecycleExecution {
  readonly inputs?: ExecutionInputPort | undefined;
  readonly liveStatus?: LiveStatusExecutionPort | undefined;
  readonly modelCatalog?: ModelCatalogExecutionPort | undefined;
  readonly effortCatalog?: EffortCatalogExecutionPort | undefined;
  readonly commandCatalog?: CommandCatalogExecutionPort | undefined;
  launch(input: {
    cwd: string;
    options?: JsonValue;
  }): Promise<LifecycleLaunchResult>;
  resume(input: {
    cwd: string;
    options?: JsonValue;
    checkpoint?: AdapterCheckpoint;
    nativeSessionId?: string;
  }): Promise<LifecycleLaunchResult>;
  stop(): Promise<void>;
}
export interface LifecycleExecutionFactory {
  create(adapter: HarnessAdapter): LifecycleExecution;
}
