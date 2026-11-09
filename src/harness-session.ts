import type { CommandResult, CoreEvent, HarnessPort, PortOutcome, SessionRecord, ShutdownResult } from './types.ts';
import { acceptHarnessEvent, sessionView } from './events.ts';

export function createSessionRecord<Result extends CommandResult>(
  id: string, port: HarnessPort<Result>, harness?: string,
): SessionRecord<Result> {
  return {
    id, port, harness, status: 'created', generation: 0,
    stopRequested: false, stopInFlight: false, startOutcomeWhileStopping: null,
  };
}

export async function startHarnessSession(
  session: SessionRecord,
  notify: (event: CoreEvent) => void,
): Promise<PortOutcome | null> {
  session.status = 'starting';
  const generation = session.generation;
  const startTask = callPort(() => session.port.start(session.id, (event) => acceptHarnessEvent(session, generation, event, notify)));
  notify({ type: 'session', session: sessionView(session) });
  const outcome = await startTask;
  if (session.generation !== generation || session.status !== 'starting') return null;
  if (session.stopRequested) {
    session.startOutcomeWhileStopping = outcome;
    return null;
  }
  session.status = outcome.kind === 'confirmed' ? 'running' : outcome.kind === 'rejected' ? 'failed' : 'unknown';
  notify({ type: 'session', session: sessionView(session) });
  return outcome;
}

export async function stopHarnessSession(
  session: SessionRecord,
  notify: (event: CoreEvent) => void,
): Promise<PortOutcome['kind']> {
  if (session.status === 'created') {
    session.status = 'stopped';
    session.stopRequested = true;
    session.generation++;
    notify({ type: 'session', session: sessionView(session) });
    return 'confirmed';
  }
  if (session.status === 'stopped') return 'rejected';
  if (session.stopInFlight) return 'unknown';
  const stopPreviouslyRequested = session.stopRequested;
  session.stopRequested = true;
  session.stopInFlight = true;
  const outcome = await callPort(() => session.port.stop(session.id));
  session.stopInFlight = false;
  if (outcome.kind === 'rejected') {
    // A rejected cleanup cannot undo uncertainty from an earlier stop.
    session.stopRequested = stopPreviouslyRequested;
    const startOutcome = session.startOutcomeWhileStopping;
    session.startOutcomeWhileStopping = null;
    if (startOutcome && session.status === 'starting') {
      session.status = startOutcome.kind === 'confirmed' ? 'running' : startOutcome.kind === 'rejected' ? 'failed' : 'unknown';
      notify({ type: 'session', session: sessionView(session) });
    }
    return outcome.kind;
  }
  session.startOutcomeWhileStopping = null;
  session.generation++;
  session.status = outcome.kind === 'confirmed' ? 'stopped' : 'unknown';
  notify({ type: 'session', session: sessionView(session) });
  return outcome.kind;
}

export async function stopAllHarnessSessions(
  sessions: Iterable<SessionRecord>,
  notify: (event: CoreEvent) => void,
): Promise<ShutdownResult> {
  const stoppedSessionIds: string[] = [];
  const uncertainSessionIds: string[] = [];
  const failedSessionIds: string[] = [];
  for (const session of sessions) {
    if (session.status === 'stopped') continue;
    let outcome: PortOutcome['kind'];
    try { outcome = await stopHarnessSession(session, notify); }
    catch { outcome = 'unknown'; }
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


export async function callPort(operation: () => Promise<PortOutcome>): Promise<PortOutcome> {
  try {
    return await operation();
  } catch {
    return { kind: 'unknown' };
  }
}
