export type SessionStatus = 'created' | 'starting' | 'running' | 'stopped' | 'failed' | 'unknown';
export type PortOutcome = { kind: 'confirmed' } | { kind: 'rejected' } | { kind: 'unknown' };

export interface SessionView {
  readonly sessionId: string;
  readonly status: SessionStatus;
  readonly harness?: string;
}

// Display payloads are snapshots, not private RPC records or secret-filtered text.
export type DisplayValue = null | boolean | number | string
  | readonly DisplayValue[] | { readonly [key: string]: DisplayValue };
export type QuestionMethod = 'confirm' | 'select' | 'input';
export type NativeQuestion = {
  readonly requestId: string;
  readonly title: string;
  readonly timeout?: number;
} & (
  | { readonly method: 'confirm'; readonly message: string }
  | { readonly method: 'select'; readonly options: readonly string[] }
  | { readonly method: 'input'; readonly placeholder?: string }
);
export type QuestionReply = { readonly requestId: string } & (
  | { readonly method: 'confirm'; readonly confirmed: boolean }
  | { readonly method: 'select' | 'input'; readonly value: string }
  | { readonly method: QuestionMethod; readonly cancelled: true }
);
// A successful local write is NOT evidence of native receipt or consumption.
export type ReplyOutcome = { kind: 'written' } | { kind: 'rejected' } | { kind: 'unknown' };
export type InteractionEvent =
  | { readonly type: 'tool'; readonly phase: 'start'; readonly toolCallId: string; readonly toolName: string; readonly args: DisplayValue }
  | { readonly type: 'tool'; readonly phase: 'update'; readonly toolCallId: string; readonly toolName: string; readonly args: DisplayValue; readonly partialResult: DisplayValue }
  | { readonly type: 'tool'; readonly phase: 'end'; readonly toolCallId: string; readonly toolName: string; readonly result: DisplayValue; readonly isError: boolean; readonly durationMs?: number }
  | { readonly type: 'question'; readonly question: NativeQuestion }
  | { readonly type: 'notification'; readonly method: 'setStatus'; readonly statusKey: string; readonly statusText?: string }
  | { readonly type: 'notification'; readonly method: 'notify'; readonly message: string; readonly level: 'info' | 'warning' | 'error' };

// Native records need no shared protocol discriminator or mandatory backend fields.
export interface NativeRecord {
  readonly [key: string]: unknown;
}
export type CommandResult = NativeRecord | { readonly kind: 'written' };
export type NativeRecordEvent = { readonly type: 'native-record'; readonly record: NativeRecord };
export type HarnessEvent = InteractionEvent | NativeRecordEvent | { type: 'text'; text: string };

export interface NativeCommand {
  readonly type: string;
  readonly [key: string]: unknown;
}
// Legacy Pi response export; this is not the shared HarnessPort return constraint.
export interface NativeResponse {
  readonly type: 'response';
  readonly id: string;
  readonly command: string;
  readonly success: boolean;
  readonly [key: string]: unknown;
}

export interface HarnessPort<Result extends CommandResult = CommandResult> {
  start(sessionId: string, emit: (event: HarnessEvent) => void): Promise<PortOutcome>;
  // null means expected-response loss, not Native refusal. A one-way write returns
  // only local written; unsupported operations may throw CoreError('harness-rejected').
  command(sessionId: string, command: NativeCommand): Promise<Result | null>;
  stop(sessionId: string): Promise<PortOutcome>;
  reply?(sessionId: string, reply: QuestionReply): Promise<ReplyOutcome>;
}

export interface HarnessRegistry<Result extends CommandResult = CommandResult> {
  resolve(harness?: string): HarnessPort<Result> | undefined;
}

export type CoreEvent =
  | ((InteractionEvent | NativeRecordEvent) & { readonly sessionId: string })
  | { type: 'text'; sessionId: string; text: string }
  | { type: 'session'; session: SessionView };

export type CoreErrorCode = 'closed' | 'duplicate-session' | 'session-not-found' | 'invalid-state' | 'harness-rejected' | 'harness-unknown';

export class CoreError extends Error {
  readonly code: CoreErrorCode;

  constructor(code: CoreErrorCode) {
    super(code);
    this.code = code;
    this.name = 'CoreError';
  }
}

export interface ShutdownResult {
  readonly stoppedSessionIds: readonly string[];
  readonly uncertainSessionIds: readonly string[];
  readonly failedSessionIds: readonly string[];
}

export interface SessionRecord<Result extends CommandResult = CommandResult> {
  readonly id: string;
  readonly port: HarnessPort<Result>;
  readonly harness?: string;
  status: SessionStatus;
  generation: number;
  stopRequested: boolean;
  stopInFlight: boolean;
  startOutcomeWhileStopping: PortOutcome | null;
}
