export type {
  SessionStatus,
  InputStatus,
  InputFailureReason,
  JsonValue,
  ImageInput,
  SessionRecord,
  PublicSession,
  InputState,
  ActivityEvent,
  SessionEvent,
  Snapshot,
  LiveStatus,
  ModelCatalog,
  EffortCatalog,
  CommandCatalog,
  HarnessOption,
  HarnessExtension,
  HarnessDescriptor,
} from "./runtime-data.js";
import type {
  InputFailureReason,
  ImageInput,
  LiveStatus,
  ModelCatalog,
  EffortCatalog,
  CommandCatalog,
  HarnessDescriptor,
  SessionRecord,
} from "./runtime-data.js";
export type { HarnessEvent } from "./runtime-harness-events.js";
import type { HarnessEvent } from "./runtime-harness-events.js";
export interface SessionStore {
  read(id: string): SessionRecord | undefined;
  list(): SessionRecord[];
  write(session: SessionRecord): void;
  delete(id: string): void;
  assertOwner(): void;
}
export interface HarnessSessionConfig {
  sessionId: string;
  harnessId: string;
  cwd: string;
  name?: string;
  checkpoint?: SessionRecord["checkpoint"];
  nativeSessionId?: string;
  adapterOptions?: Record<string, unknown>;
}
export type StartOutcome =
  | {
      kind: "started";
      nativeSessionId?: string;
      checkpoint?: SessionRecord["checkpoint"];
    }
  | { kind: "failed" }
  | { kind: "uncertain" };
export type SubmitOutcome =
  | { kind: "accepted" }
  | { kind: "rejected"; reason: InputFailureReason }
  | { kind: "uncertain" };
export type StopOutcome = { kind: "confirmed" } | { kind: "unknown" };
export type CancelOutcome =
  { kind: "accepted" } | { kind: "rejected" } | { kind: "uncertain" };
export interface HarnessPort {
  readonly descriptor: HarnessDescriptor;
  start(
    config: HarnessSessionConfig,
    emit: (event: HarnessEvent) => void,
    beforeWrite: () => boolean,
  ): Promise<StartOutcome>;
  submit(
    sessionId: string,
    input: { inputId: string; text: string; images?: ImageInput[] },
    beforeWrite: () => boolean,
  ): Promise<SubmitOutcome>;
  stop(sessionId: string): Promise<StopOutcome>;
  cancel?(
    sessionId: string,
    inputId: string,
    beforeWrite: () => boolean,
  ): Promise<CancelOutcome>;
  status?(sessionId: string): Promise<LiveStatus>;
  models?(sessionId: string): Promise<ModelCatalog>;
  efforts?(sessionId: string): Promise<EffortCatalog>;
  commands?(sessionId: string): Promise<CommandCatalog>;
  changeEffort?(
    sessionId: string,
    level: string,
    beforeWrite: () => boolean,
  ): Promise<"applied" | "not-applied" | "unknown">;
  shutdown(): Promise<StopOutcome>;
}
