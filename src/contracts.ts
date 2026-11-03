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

export type HarnessEvent =
  | { type: 'text'; text: string }
  | { type: 'input-completed'; inputId: string }
  | { type: 'input-failed'; inputId: string; certainty: 'definitive' | 'unknown' };

export interface HarnessPort {
  start(sessionId: string, emit: (event: HarnessEvent) => void): Promise<PortOutcome>;
  send(sessionId: string, inputId: string, text: string): Promise<PortOutcome>;
  stop(sessionId: string): Promise<PortOutcome>;
}

export type CoreEvent =
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
