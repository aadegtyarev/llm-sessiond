import type { CoreEvent, HarnessEvent, HarnessPort, InputView, PortOutcome, SessionStatus, ShutdownResult } from './contracts.ts';
import { inputView, sessionView } from './events.ts';

export interface SessionRecord {
  readonly id: string;
  status: SessionStatus;
  input: InputView | null;
  readonly inputIds: Set<string>;
  generation: number;
}

export async function startHarnessSession(
  port: HarnessPort,
  session: SessionRecord,
  notify: (event: CoreEvent) => void,
): Promise<PortOutcome | null> {
  session.status = 'starting';
  notify({ type: 'session', session: sessionView(session) });
  const generation = session.generation;
  const outcome = await callPort(() => port.start(session.id, (event) => acceptHarnessEvent(session, generation, event, notify)));
  if (session.generation !== generation || session.status !== 'starting') return null;
  session.status = outcome.kind === 'confirmed' ? 'running' : outcome.kind === 'rejected' ? 'failed' : 'unknown';
  notify({ type: 'session', session: sessionView(session) });
  return outcome;
}

export async function stopHarnessSession(
  port: HarnessPort,
  session: SessionRecord,
  notify: (event: CoreEvent) => void,
): Promise<PortOutcome['kind']> {
  if (session.status === 'created') {
    session.status = 'stopped';
    notify({ type: 'session', session: sessionView(session) });
    return 'confirmed';
  }
  if (session.status === 'stopped' || session.status === 'failed') return 'rejected';
  const outcome = await callPort(() => port.stop(session.id));
  if (outcome.kind === 'rejected') return outcome.kind;
  session.generation++;
  session.status = outcome.kind === 'confirmed' ? 'stopped' : 'unknown';
  if (session.input?.status === 'pending') {
    session.input = { inputId: session.input.inputId, status: 'unknown' };
    notify({ type: 'input', sessionId: session.id, input: inputView(session.input) });
  }
  notify({ type: 'session', session: sessionView(session) });
  return outcome.kind;
}

export async function stopAllHarnessSessions(
  port: HarnessPort,
  sessions: Iterable<SessionRecord>,
  notify: (event: CoreEvent) => void,
): Promise<ShutdownResult> {
  const stoppedSessionIds: string[] = [];
  const uncertainSessionIds: string[] = [];
  const failedSessionIds: string[] = [];
  for (const session of sessions) {
    if (session.status === 'stopped' || session.status === 'failed') continue;
    const outcome = await stopHarnessSession(port, session, notify);
    if (outcome === 'confirmed') stoppedSessionIds.push(session.id);
    else if (outcome === 'unknown') uncertainSessionIds.push(session.id);
    else failedSessionIds.push(session.id);
  }
  return Object.freeze({
    stoppedSessionIds: Object.freeze(stoppedSessionIds),
    uncertainSessionIds: Object.freeze(uncertainSessionIds),
    failedSessionIds: Object.freeze(failedSessionIds),
  });
}

function acceptHarnessEvent(
  session: SessionRecord,
  generation: number,
  event: HarnessEvent,
  notify: (event: CoreEvent) => void,
): void {
  if (session.generation !== generation || session.status !== 'running') return;
  if (event.type === 'text') {
    notify({ type: 'text', sessionId: session.id, text: event.text });
    return;
  }
  if (!session.input || session.input.inputId !== event.inputId || (session.input.status !== 'pending' && session.input.status !== 'unknown')) return;
  session.input = {
    inputId: event.inputId,
    status: event.type === 'input-completed' ? 'completed' : event.certainty === 'definitive' ? 'failed' : 'unknown',
  };
  notify({ type: 'input', sessionId: session.id, input: inputView(session.input) });
}

export async function callPort(operation: () => Promise<PortOutcome>): Promise<PortOutcome> {
  try {
    return await operation();
  } catch {
    return { kind: 'unknown' };
  }
}
