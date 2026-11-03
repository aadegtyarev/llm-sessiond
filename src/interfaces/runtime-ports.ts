export type {
  SessionStatus,
  InputStatus,
  InputFailureReason,
  JsonValue,
  ImageInput,
  SessionRecord,
  PublicSession,
  InputState,
  SessionEvent,
  Snapshot,
  LiveStatus,
  ModelCatalog,
  EffortCatalog,
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
  HarnessDescriptor,
  SessionRecord,
} from "./runtime-data.js";
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
  changeEffort?(
    sessionId: string,
    level: string,
    beforeWrite: () => boolean,
  ): Promise<"applied" | "not-applied" | "unknown">;
  shutdown(): Promise<StopOutcome>;
}
export type HarnessEvent =
  | { kind: "output"; sessionId: string; text: string }
  | { kind: "settled"; sessionId: string; inputId: string }
  | {
      kind: "failed";
      sessionId: string;
      inputId: string;
      reason?:
        "prompt_rejected" | "hold_timeout" | "held_and_stopped" | "canceled";
    }
  | { kind: "ended"; sessionId: string };
