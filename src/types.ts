export type SessionStatus = 'created' | 'starting' | 'running' | 'stopped' | 'failed' | 'unknown';
export type InputStatus = 'pending' | 'completed' | 'failed' | 'cancelled' | 'unknown';
export type PortOutcome = { kind: 'confirmed' } | { kind: 'rejected' } | { kind: 'unknown' };

export interface InputView {
  readonly inputId: string;
  readonly status: InputStatus;
}

export interface SessionView {
  readonly sessionId: string;
  readonly status: SessionStatus;
  readonly input: InputView | null;
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

export type HarnessEvent =
  | InteractionEvent
  | { type: 'text'; text: string }
  | { type: 'input-completed'; inputId: string }
  | { type: 'input-cancelled'; inputId: string }
  | { type: 'input-failed'; inputId: string; certainty: 'definitive' | 'unknown' };

// Private exact-file binding; never part of public views or HTTP input.
export interface NativeBinding {
  file: string;
  cwd: string;
  nativeId: string | null;
  identity: string | null;
  fresh: boolean;
}

export interface HarnessPort {
  start(sessionId: string, emit: (event: HarnessEvent) => void, native?: NativeBinding): Promise<PortOutcome>;
  send(sessionId: string, inputId: string, text: string): Promise<PortOutcome>;
  stop(sessionId: string): Promise<PortOutcome>;
  reply?(sessionId: string, reply: QuestionReply): Promise<ReplyOutcome>;
  // Confirmed acknowledges control delivery, never input settlement.
  cancel?(sessionId: string, inputId: string): Promise<PortOutcome>;
}

export type CoreEvent =
  | (InteractionEvent & { readonly sessionId: string })
  | { type: 'text'; sessionId: string; text: string }
  | { type: 'session'; session: SessionView }
  | { type: 'input'; sessionId: string; input: InputView };

export type CoreErrorCode = 'closed' | 'duplicate-session' | 'session-not-found' | 'invalid-state' | 'input-in-flight' | 'duplicate-input' | 'harness-rejected' | 'harness-unknown' | 'storage-failed' | 'native-invalid' | 'native-owned';

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

export interface InputState {
  readonly inputId: string;
  status: InputStatus;
  generation?: number;
  accepted?: boolean;
  cancelRequested?: boolean;
  cancelInFlight?: boolean;
  cancelledWhileCancelling?: boolean;
}

export interface SessionRecord {
  readonly id: string;
  status: SessionStatus;
  input: InputState | null;
  readonly inputIds: Set<string>;
  generation: number;
  stopRequested: boolean;
  stopInFlight: boolean;
  startOutcomeWhileStopping: PortOutcome | null;
  native?: NativeBinding;
  owned?: boolean;
  stopProven?: boolean;
  operations: number;
  deleting?: boolean;
}
