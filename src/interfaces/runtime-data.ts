export type SessionStatus =
  "starting" | "running" | "stopped" | "failed" | "uncertain";
export type InputStatus =
  "pending" | "accepted" | "completed" | "failed" | "uncertain";
export type InputFailureReason =
  "prompt_rejected" | "hold_timeout" | "held_and_stopped" | "canceled";
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export interface ImageInput {
  mimeType: string;
  data: string;
}
export interface SessionRecord {
  id: string;
  harnessId: string;
  cwd: string;
  status: SessionStatus;
  name?: string;
  nativeSessionId?: string;
  adapterOptions?: Record<string, unknown>;
  failureReason?: string;
  failedAt?: string;
  createdAt?: string;
  adapterState?: unknown;
  checkpoint?: { namespace: string; version: number; data: unknown };
}
export type PublicSession = Omit<
  SessionRecord,
  "checkpoint" | "adapterState" | "createdAt"
>;
export interface InputState {
  sessionId: string;
  inputId: string;
  state: InputStatus;
  reason?: InputFailureReason;
}
export interface SessionEvent {
  revision: number;
  kind: "session.changed" | "session.deleted" | "output" | "input.state";
  sessionId: string;
  session?: PublicSession;
  text?: string;
  input?: InputState;
}
export interface Snapshot {
  afterRevision: number;
  sessions: PublicSession[];
}
export interface LiveStatus {
  model?: { provider: string; id: string; name: string };
  effort?: string;
  usage?: Record<string, number | null>;
}
export interface ModelCatalog {
  models: Array<{ provider: string; id: string; name: string }>;
}
export interface EffortCatalog {
  levels: string[];
  current?: string;
}
export interface HarnessOption {
  key: string;
  label: string;
  values: JsonValue[];
  allowCustom?: boolean;
  defaultValue?: JsonValue;
  dangerousValues?: JsonValue[];
}
export interface HarnessExtension {
  namespace: string;
  version: number;
  operations: Array<{
    name: string;
    effect: "read" | "write";
    guardRequired: boolean;
  }>;
  events: string[];
}
export interface HarnessDescriptor {
  id: string;
  aliases: string[];
  capabilities: string[];
  metadata?: Record<string, string>;
  options?: HarnessOption[];
  extensions?: HarnessExtension[];
}
