export type SessionStatus =
  "starting" | "running" | "stopped" | "failed" | "uncertain";
export type InputState =
  "pending" | "accepted" | "completed" | "failed" | "uncertain";
export interface Failure {
  code: string;
  at: string;
}
export interface SessionSummary {
  id: string;
  name?: string;
  harnessId: "pi";
  cwd: string;
  status: SessionStatus;
  nativeSessionId?: string;
  failure?: Failure;
}
export interface ImageInput {
  mimeType: string;
  data: string;
}
export interface SessionInput {
  text: string;
  images?: ImageInput[];
}
export interface EventEnvelope {
  apiVersion: "v1";
  eventId: number;
  sessionId: string;
  type: string;
  at: string;
  data: Record<string, unknown>;
}
export interface SessionRecord extends SessionSummary {
  currentInput: string | undefined;
  pendingSubmit: number | undefined;
  submitSequence: number;
  runtimeGeneration: number;
  child: import("node:child_process").ChildProcess | undefined;
}
