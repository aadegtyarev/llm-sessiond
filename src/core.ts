import { CoreError, type CommandResult, type CoreEvent, type HarnessPort, type HarnessRegistry, type NativeCommand, type QuestionReply, type ReplyOutcome, type SessionRecord, type SessionView, type ShutdownResult } from './types.ts';
import { createEventPublisher, sessionView, snapshot } from './events.ts';
import { createSessionRecord, startHarnessSession, stopAllHarnessSessions, stopHarnessSession } from './harness-session.ts';
export { CoreError } from './types.ts';
export type { CoreErrorCode, CoreEvent, HarnessEvent, HarnessPort, HarnessRegistry, CommandResult, NativeRecord, NativeRecordEvent, NativeCommand, NativeResponse, PortOutcome, SessionStatus, SessionView, ShutdownResult, DisplayValue, InteractionEvent, NativeQuestion, QuestionMethod, QuestionReply, ReplyOutcome } from './types.ts';
export { createHarnessRegistry } from './harness-registry.ts';

export class SessionCore<Result extends CommandResult = CommandResult> {
  private readonly sessions = new Map<string, SessionRecord<Result>>();
  private readonly events = createEventPublisher();
  private shutdownTask: Promise<ShutdownResult> | null = null;
  private readonly harnesses: HarnessRegistry<Result>;

  constructor(source: HarnessPort<Result> | HarnessRegistry<Result>) {
    this.harnesses = 'resolve' in source ? source : {
      resolve: harness => harness === undefined ? source : undefined,
    };
  }

  create(sessionId: string, harness?: string): SessionView {
    this.assertOpen();
    if (this.sessions.has(sessionId)) throw new CoreError('duplicate-session');
    const port = this.harnesses.resolve(harness);
    if (!port) throw new CoreError('harness-rejected');
    const record = createSessionRecord(sessionId, port, harness);
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
    if (session.status !== 'created' || session.stopInFlight) throw new CoreError('invalid-state');
    const outcome = await startHarnessSession(session, this.events.publish);
    if (!outcome) return sessionView(session);
    if (outcome.kind !== 'confirmed') throw new CoreError(outcome.kind === 'rejected' ? 'harness-rejected' : 'harness-unknown');
    return sessionView(session);
  }

  async command(sessionId: string, command: NativeCommand): Promise<Result> {
    this.assertOpen();
    const session = this.requireSession(sessionId);
    if (session.status !== 'running' || session.stopRequested) throw new CoreError('invalid-state');
    // Only the transport may report loss. Native refusals are ordinary responses.
    let response: Result | null;
    try { response = await session.port.command(sessionId, snapshot(command)); }
    catch (error) {
      if (error instanceof CoreError && error.code === 'harness-rejected') throw error;
      throw new CoreError('harness-unknown');
    }
    if (!response) throw new CoreError('harness-unknown');
    return snapshot(response);
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
    try { outcome = await session.port.reply?.(sessionId, snapshot(reply)) ?? { kind: 'rejected' }; }
    catch { outcome = { kind: 'unknown' }; }
    if (session.generation !== generation || session.stopRequested) return { kind: 'unknown' };
    return Object.freeze({ kind: outcome.kind });
  }

  async stop(sessionId: string): Promise<SessionView> {
    this.assertOpen();
    const session = this.requireSession(sessionId);
    const outcome = await stopHarnessSession(session, this.events.publish);
    if (outcome === 'rejected') throw new CoreError('harness-rejected');
    if (outcome === 'unknown') throw new CoreError('harness-unknown');
    return sessionView(session);
  }

  shutdown(): Promise<ShutdownResult> {
    if (this.shutdownTask) return this.shutdownTask;
    this.shutdownTask = Promise.resolve().then(() =>
      stopAllHarnessSessions(this.sessions.values(), this.events.publish));
    return this.shutdownTask;
  }

  private assertOpen(): void {
    if (this.shutdownTask) throw new CoreError('closed');
  }

  private requireSession(sessionId: string): SessionRecord<Result> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new CoreError('session-not-found');
    return session;
  }
}
