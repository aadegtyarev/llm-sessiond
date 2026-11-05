import { CoreError, type CoreEvent, type HarnessPort, type InputView, type QuestionReply, type ReplyOutcome, type SessionRecord, type SessionView, type ShutdownResult } from './types.ts';
import { createEventPublisher, inputView, sessionView } from './events.ts';
import { callPort, createSessionRecord, startHarnessSession, stopAllHarnessSessions, stopHarnessSession } from './harness-session.ts';
export { CoreError } from './types.ts';
export type { CoreErrorCode, CoreEvent, HarnessEvent, HarnessPort, InputStatus, InputView, PortOutcome, SessionStatus, SessionView, ShutdownResult, DisplayValue, InteractionEvent, NativeQuestion, QuestionMethod, QuestionReply, ReplyOutcome } from './types.ts';

export class SessionCore {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly events = createEventPublisher();
  private closed = false;
  private shutdownTask: Promise<ShutdownResult> | null = null;
  private readonly port: HarnessPort;

  constructor(port: HarnessPort) {
    this.port = port;
  }

  create(sessionId: string): SessionView {
    this.assertOpen();
    if (this.sessions.has(sessionId)) throw new CoreError('duplicate-session');
    const record = createSessionRecord(sessionId);
    this.sessions.set(sessionId, record);
    this.events.publish({ type: 'session', session: sessionView(record) });
    return sessionView(record);
  }

  get(sessionId: string): SessionView {
    this.assertOpen();
    return sessionView(this.requireSession(sessionId));
  }

  list(): readonly SessionView[] {
    this.assertOpen();
    return [...this.sessions.values()].map(sessionView);
  }

  subscribe(listener: (event: CoreEvent) => unknown): () => void {
    this.assertOpen();
    return this.events.subscribe(listener);
  }

  async start(sessionId: string): Promise<SessionView> {
    this.assertOpen();
    const session = this.requireSession(sessionId);
    if (session.status !== 'created') throw new CoreError('invalid-state');
    const outcome = await startHarnessSession(this.port, session, this.events.publish);
    if (!outcome) return sessionView(session);
    if (outcome.kind !== 'confirmed') throw new CoreError(outcome.kind === 'rejected' ? 'harness-rejected' : 'harness-unknown');
    return sessionView(session);
  }

  async send(sessionId: string, inputId: string, text: string): Promise<InputView> {
    this.assertOpen();
    const session = this.requireSession(sessionId);
    if (session.status !== 'running' || session.stopRequested) throw new CoreError('invalid-state');
    if (session.input?.status === 'pending' || session.input?.status === 'unknown' || session.input?.cancelInFlight) throw new CoreError('input-in-flight');
    if (session.inputIds.has(inputId)) throw new CoreError('duplicate-input');
    session.inputIds.add(inputId);
    const input: NonNullable<SessionRecord['input']> = { inputId, status: 'pending' };
    session.input = input;
    const generation = session.generation;
    const sendTask = callPort(() => this.port.send(sessionId, inputId, text));
    if (session.generation === generation && session.input === input && input.status === 'pending') {
      this.events.publish({ type: 'input', sessionId, input: inputView(input) });
    }
    const outcome = await sendTask;
    input.accepted = outcome.kind === 'confirmed';
    if (session.generation === generation && session.input === input && input.status === 'pending' && outcome.kind !== 'confirmed') {
      input.status = outcome.kind === 'rejected' ? 'failed' : 'unknown';
      this.events.publish({ type: 'input', sessionId, input: inputView(input) });
    }
    return inputView(input);
  }

  /** Target one accepted input; only a harness terminal event proves cancellation. */
  async cancel(sessionId: string, inputId: string): Promise<InputView> {
    this.assertOpen();
    const session = this.requireSession(sessionId);
    const input = session.input;
    if (session.status !== 'running' || session.stopRequested || !input
      || input.inputId !== inputId || input.status !== 'pending'
      || !input.accepted || input.cancelRequested) throw new CoreError('invalid-state');
    const generation = session.generation;
    input.cancelRequested = true;
    input.cancelInFlight = true; // Also gates a natural terminal racing the control command.
    const outcome = await callPort(() => this.port.cancel?.(sessionId, inputId)
      ?? Promise.resolve({ kind: 'rejected' }));
    input.cancelInFlight = false;
    if (session.generation === generation && session.input === input
      && input.status === 'pending' && outcome.kind === 'unknown') {
      input.status = 'unknown';
      this.events.publish({ type: 'input', sessionId, input: inputView(input) });
    }
    if (outcome.kind === 'rejected') throw new CoreError('harness-rejected');
    return inputView(input);
  }

  /** Reply to a native question, not a new model input. Written is local only. */
  async reply(sessionId: string, reply: QuestionReply): Promise<ReplyOutcome> {
    this.assertOpen();
    const session = this.requireSession(sessionId);
    if (session.stopRequested || (session.status !== 'starting' && session.status !== 'running')) {
      throw new CoreError('invalid-state');
    }
    const generation = session.generation;
    let outcome: ReplyOutcome;
    try { outcome = await this.port.reply?.(sessionId, reply) ?? { kind: 'rejected' }; }
    catch { outcome = { kind: 'unknown' }; }
    if (session.generation !== generation || session.stopRequested) return { kind: 'unknown' };
    return Object.freeze({ kind: outcome.kind });
  }

  async stop(sessionId: string): Promise<SessionView> {
    this.assertOpen();
    const session = this.requireSession(sessionId);
    const outcome = await stopHarnessSession(this.port, session, this.events.publish);
    if (outcome === 'rejected') throw new CoreError('harness-rejected');
    if (outcome === 'unknown') throw new CoreError('harness-unknown');
    return sessionView(session);
  }

  shutdown(): Promise<ShutdownResult> {
    if (this.shutdownTask) return this.shutdownTask;
    this.closed = true;
    this.shutdownTask = Promise.resolve().then(() =>
      stopAllHarnessSessions(this.port, this.sessions.values(), this.events.publish));
    return this.shutdownTask;
  }

  private assertOpen(): void {
    if (this.closed) throw new CoreError('closed');
  }

  private requireSession(sessionId: string): SessionRecord {
    const session = this.sessions.get(sessionId);
    if (!session) throw new CoreError('session-not-found');
    return session;
  }
}
