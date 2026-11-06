import { CoreError, type CoreEvent, type HarnessPort, type InputView, type PortOutcome, type QuestionReply, type ReplyOutcome, type SessionRecord, type SessionView, type ShutdownResult } from './types.ts';
import { createEventPublisher, inputView, sessionView } from './events.ts';
import { callPort, createSessionRecord, startHarnessSession, stopAllHarnessSessions, stopHarnessSession } from './harness-session.ts';
import { NativeRegistry, type NativeOptions } from './native-registry.ts';
import { checkNative } from './native-history.ts';
export { CoreError } from './types.ts';
export type { NativeOptions } from './native-registry.ts';
export type { CoreErrorCode, CoreEvent, HarnessEvent, HarnessPort, InputStatus, InputView, PortOutcome, SessionStatus, SessionView, ShutdownResult, DisplayValue, InteractionEvent, NativeQuestion, QuestionMethod, QuestionReply, ReplyOutcome } from './types.ts';

export class SessionCore {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly events = createEventPublisher();
  private closed = false;
  private shutdownTask: Promise<ShutdownResult> | null = null;
  private readonly port: HarnessPort;

  private readonly registry?: NativeRegistry;

  constructor(port: HarnessPort, native?: NativeOptions) {
    this.port = port;
    if (native) {
      this.registry = new NativeRegistry(native);
      try { for (const session of this.registry.load()) this.sessions.set(session.id, session); }
      catch (error) { this.registry.release(); throw error; }
    }
  }

  create(sessionId: string): SessionView {
    this.assertOpen();
    if (this.sessions.has(sessionId)) throw new CoreError('duplicate-session');
    const record = createSessionRecord(sessionId);
    if (this.registry) {
      record.native = this.registry.reservation();
      // Intent precedes allocation: even native startup can have resource effects.
      this.registry.save(record);
      this.sessions.set(sessionId, record);
      try {
        this.registry.allocate(record.native);
        this.registry.save(record);
      } catch (error) {
        record.status = 'unknown'; record.stopRequested = true;
        record.stopProven = true; // No launch has occurred; explicit local cleanup remains possible.
        throw error;
      }
    }
    this.sessions.set(sessionId, record);
    this.events.publish({ type: 'session', session: sessionView(record) });
    return sessionView(record);
  }

  catalogue(): readonly { readonly nativeId: string }[] {
    this.assertOpen();
    if (!this.registry) throw new CoreError('invalid-state');
    const bindings = this.registry.catalogue();
    return bindings.filter(binding => bindings.filter(other => other.nativeId === binding.nativeId).length === 1)
      .map(binding => Object.freeze({ nativeId: binding.nativeId! }));
  }

  register(sessionId: string, nativeId: string): SessionView {
    this.assertOpen();
    if (!this.registry) throw new CoreError('invalid-state');
    if (this.sessions.has(sessionId)) throw new CoreError('duplicate-session');
    const binding = this.registry.resolve(nativeId);
    for (const session of this.sessions.values()) {
      if (session.native?.file === binding.file || session.native?.nativeId === binding.nativeId
        || session.native?.identity === binding.identity) throw new CoreError('native-owned');
    }
    const record = createSessionRecord(sessionId);
    record.native = binding;
    this.registry.save(record);
    this.sessions.set(sessionId, record);
    this.events.publish({ type: 'session', session: sessionView(record) });
    return sessionView(record);
  }

  delete(sessionId: string): void {
    this.assertOpen();
    const session = this.requireSession(sessionId);
    if (!this.registry || session.status !== 'stopped' || session.operations || session.stopInFlight) throw new CoreError('invalid-state');
    if (!session.deleting) {
      checkNative(session.native!, session.native!.fresh);
      session.deleting = true;
      try { this.registry.save(session); } catch (error) { session.deleting = false; throw error; }
    }
    this.registry.remove(session);
    this.sessions.delete(sessionId);
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
    if (session.deleting || session.operations || session.stopInFlight || (session.status !== 'created'
      && !(this.registry && session.status === 'stopped'))) throw new CoreError('invalid-state');
    if (this.registry) {
      const nativeId = checkNative(session.native!, session.native!.fresh);
      if (nativeId !== null) session.native!.nativeId = nativeId;
      session.generation++;
      session.stopRequested = false;
    }
    session.operations = (session.operations ?? 0) + 1;
    let outcome: PortOutcome | null;
    try { outcome = await startHarnessSession(this.port, session, this.events.publish, this.registry); }
    finally { session.operations--; }
    if (!outcome) return sessionView(session);
    if (outcome.kind !== 'confirmed') throw new CoreError(outcome.kind === 'rejected' ? 'harness-rejected' : 'harness-unknown');
    return sessionView(session);
  }

  async send(sessionId: string, inputId: string, text: string): Promise<InputView> {
    this.assertOpen();
    const session = this.requireSession(sessionId);
    if (session.status !== 'running' || session.stopRequested) throw new CoreError('invalid-state');
    if (((session.input?.status === 'pending' || session.input?.status === 'unknown')
      && (!this.registry || session.input.generation === session.generation)) || session.input?.cancelInFlight) throw new CoreError('input-in-flight');
    if (session.inputIds.has(inputId)) throw new CoreError('duplicate-input');
    session.inputIds.add(inputId);
    const input: NonNullable<SessionRecord['input']> = { inputId, status: 'pending', generation: session.generation };
    const previous = session.input;
    session.input = input;
    try { this.registry?.save(session); }
    catch (error) {
      session.input = previous;
      // Conservatively retain the ID even if a rename succeeded but its fsync failed.
      throw error;
    }
    const generation = session.generation;
    session.operations = (session.operations ?? 0) + 1;
    const sendTask = callPort(() => this.port.send(sessionId, inputId, text));
    if (session.generation === generation && session.input === input && input.status === 'pending') {
      this.events.publish({ type: 'input', sessionId, input: inputView(input) });
    }
    const outcome = await sendTask;
    session.operations--;
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
    session.operations = (session.operations ?? 0) + 1;
    const outcome = await callPort(() => this.port.cancel?.(sessionId, inputId)
      ?? Promise.resolve({ kind: 'rejected' }));
    session.operations--;
    input.cancelInFlight = false;
    if (session.generation === generation && session.input === input
      && input.cancelledWhileCancelling && (input.status === 'pending' || input.status === 'unknown')) {
      input.cancelledWhileCancelling = false;
      input.status = 'cancelled';
      this.events.publish({ type: 'input', sessionId, input: inputView(input) });
    }
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
    session.operations = (session.operations ?? 0) + 1;
    try { outcome = await this.port.reply?.(sessionId, reply) ?? { kind: 'rejected' }; }
    catch { outcome = { kind: 'unknown' }; }
    finally { session.operations--; }
    if (session.generation !== generation || session.stopRequested) return { kind: 'unknown' };
    return Object.freeze({ kind: outcome.kind });
  }

  async stop(sessionId: string): Promise<SessionView> {
    this.assertOpen();
    const session = this.requireSession(sessionId);
    // Fence managed reopen/delete until the entire stop result and its publications finish,
    // not merely until the port ACK. Explicit cleanup reentry still targets this generation.
    if (this.registry) session.operations = (session.operations ?? 0) + 1;
    try {
      const outcome = await stopHarnessSession(this.port, session, this.events.publish, this.registry);
      if (outcome === 'rejected') throw new CoreError('harness-rejected');
      if (outcome === 'unknown') throw new CoreError('harness-unknown');
      return sessionView(session);
    } finally { if (this.registry) session.operations--; }
  }

  shutdown(): Promise<ShutdownResult> {
    if (this.shutdownTask) return this.shutdownTask;
    this.closed = true;
    this.shutdownTask = Promise.resolve().then(async () => {
      const result = await stopAllHarnessSessions(this.port, this.sessions.values(), this.events.publish, this.registry);
      if (result.uncertainSessionIds.length === 0 && result.failedSessionIds.length === 0) this.registry?.release();
      return result;
    });
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
