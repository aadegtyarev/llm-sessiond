import { CoreError, type CoreEvent, type HarnessPort, type InputView, type SessionView, type ShutdownResult } from './contracts.ts';
import { createEventPublisher, inputView, sessionView } from './events.ts';
import { callPort, startHarnessSession, stopAllHarnessSessions, stopHarnessSession, type SessionRecord } from './harness-session.ts';
export { CoreError } from './contracts.ts';
export type { CoreErrorCode, CoreEvent, HarnessEvent, HarnessPort, InputStatus, InputView, PortOutcome, SessionStatus, SessionView, ShutdownResult } from './contracts.ts';

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
    const record: SessionRecord = { id: sessionId, status: 'created', input: null, inputIds: new Set(), generation: 0 };
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
    if (session.status !== 'running') throw new CoreError('invalid-state');
    if (session.input?.status === 'pending' || session.input?.status === 'unknown') throw new CoreError('input-in-flight');
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
    if (session.generation === generation && session.input === input && input.status === 'pending' && outcome.kind !== 'confirmed') {
      input.status = outcome.kind === 'rejected' ? 'failed' : 'unknown';
      this.events.publish({ type: 'input', sessionId, input: inputView(input) });
    }
    return inputView(input);
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
