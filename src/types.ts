export type SessionStatus = 'created' | 'starting' | 'running' | 'stopped' | 'failed' | 'unknown';
export type InputStatus = 'pending' | 'completed' | 'failed' | 'unknown';
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
  | { type: 'tool'; phase: 'start'; toolCallId: string; toolName: string; args: DisplayValue }
  | { type: 'tool'; phase: 'update'; toolCallId: string; toolName: string; args: DisplayValue; partialResult: DisplayValue }
  | { type: 'tool'; phase: 'end'; toolCallId: string; toolName: string; result: DisplayValue; isError: boolean; durationMs?: number }
  | { type: 'question'; question: NativeQuestion }
  | { type: 'notification'; method: 'setStatus'; statusKey: string; statusText?: string }
  | { type: 'notification'; method: 'notify'; message: string; level: 'info' | 'warning' | 'error' };

export type HarnessEvent =
  | InteractionEvent
  | { type: 'text'; text: string }
  | { type: 'input-completed'; inputId: string }
  | { type: 'input-failed'; inputId: string; certainty: 'definitive' | 'unknown' };

export interface HarnessPort {
  start(sessionId: string, emit: (event: HarnessEvent) => void): Promise<PortOutcome>;
  send(sessionId: string, inputId: string, text: string): Promise<PortOutcome>;
  stop(sessionId: string): Promise<PortOutcome>;
  reply?(sessionId: string, reply: QuestionReply): Promise<ReplyOutcome>;
}

export type CoreEvent =
  | (InteractionEvent & { readonly sessionId: string })
  | { type: 'text'; sessionId: string; text: string }
  | { type: 'session'; session: SessionView }
  | { type: 'input'; sessionId: string; input: InputView };

export type CoreErrorCode = 'closed' | 'duplicate-session' | 'session-not-found' | 'invalid-state' | 'input-in-flight' | 'duplicate-input' | 'harness-rejected' | 'harness-unknown';

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
}
