import type { CoreEvent, HarnessPort, InputView, PortOutcome, SessionRecord, ShutdownResult } from './types.ts';
import { acceptHarnessEvent, inputView, sessionView } from './events.ts';
import type { NativeRegistry } from './native-registry.ts';
import { checkNative } from './native-history.ts';
import { pinNativeStartup } from './native-startup.ts';

function saveNativeReadiness(session: SessionRecord, registry: NativeRegistry): void {
  const native = { ...session.native!, nativeId: checkNative(session.native!) };
  // This attempt pinned/derived selection BEFORE launch. Trusted native migration may
  // rewrite legacy bytes; only verified port readiness + valid current history can clear.
  // A failed attempt retains the old pin and cannot silently adopt a rewritten prefix.
  delete native.startupReference;
  // Keep the in-memory reference until the actual durable readiness barrier succeeds.
  registry.save({ ...session, native });
  session.native = native;
}


export function createSessionRecord(id: string): SessionRecord {
  return {
    id, status: 'created', input: null, inputIds: new Set(), generation: 0,
    stopRequested: false, stopInFlight: false, startOutcomeWhileStopping: null, operations: 0,
  };
}

export async function startHarnessSession(
  port: HarnessPort,
  session: SessionRecord,
  notify: (event: CoreEvent) => void,
  registry?: NativeRegistry,
): Promise<PortOutcome | null> {
  const previous = session.status;
  if (registry) pinNativeStartup(session.native!);
  const nativeStart = session.native && { ...session.native };
  session.status = 'starting';
  if (registry) {
    session.native!.fresh = false;
    try { registry.save(session); }
    catch (error) { session.status = previous; session.native!.fresh = nativeStart!.fresh; throw error; }
  }
  session.owned = true;
  session.stopProven = false;
  const generation = session.generation;
  const startTask = callPort(() => port.start(session.id, (event) => acceptHarnessEvent(session, generation, event, notify), nativeStart));
  notify({ type: 'session', session: sessionView(session) });
  const outcome = await startTask;
  if (session.generation !== generation || session.status !== 'starting') return null;
  if (session.stopRequested) {
    if (registry) {
      try {
        if (outcome.kind === 'confirmed') session.native!.nativeId = checkNative(session.native!);
        registry.save(session);
      } catch (error) {
        session.status = 'unknown'; session.generation++;
        throw error;
      }
    }
    session.startOutcomeWhileStopping = outcome;
    return null;
  }
  session.status = outcome.kind === 'confirmed' ? 'running' : outcome.kind === 'rejected' ? 'failed' : 'unknown';
  if (registry) {
    try {
      if (outcome.kind === 'confirmed') saveNativeReadiness(session, registry);
      else registry.save(session);
    } catch (error) {
      session.status = 'unknown'; session.stopRequested = true; session.generation++;
      throw error;
    }
  }
  notify({ type: 'session', session: sessionView(session) });
  return outcome;
}

export async function stopHarnessSession(
  port: HarnessPort,
  session: SessionRecord,
  notify: (event: CoreEvent) => void,
  registry?: NativeRegistry,
): Promise<PortOutcome['kind']> {
  if (session.status === 'created' || (registry && session.stopProven && session.status === 'unknown')) {
    const previous = session.status;
    session.status = 'stopped';
    try { registry?.save(session); } catch (error) { session.status = previous; throw error; }
    notify({ type: 'session', session: sessionView(session) });
    return 'confirmed';
  }
  if (session.status === 'stopped' || (session.status === 'failed' && !registry)) return 'rejected';
  // A restored dirty record is not ownership of any child in this daemon.
  if (registry && !session.owned) return 'unknown';
  if (session.stopInFlight) return 'unknown';
  const stopPreviouslyRequested = session.stopRequested;
  session.stopRequested = true;
  session.stopInFlight = true;
  const outcome = await callPort(() => port.stop(session.id));
  session.stopInFlight = false;
  if (outcome.kind === 'rejected') {
    // A rejected cleanup cannot undo uncertainty from an earlier stop.
    session.stopRequested = stopPreviouslyRequested;
    const startOutcome = session.startOutcomeWhileStopping;
    session.startOutcomeWhileStopping = null;
    if (startOutcome && session.status === 'starting') {
      session.status = startOutcome.kind === 'confirmed' ? 'running' : startOutcome.kind === 'rejected' ? 'failed' : 'unknown';
      if (registry) {
        try {
          if (startOutcome.kind === 'confirmed') saveNativeReadiness(session, registry);
          else registry.save(session);
        } catch (error) { session.status = 'unknown'; session.stopRequested = true; session.generation++; throw error; }
      }
      notify({ type: 'session', session: sessionView(session) });
    }
    return outcome.kind;
  }
  session.startOutcomeWhileStopping = null;
  session.generation++;
  session.stopProven = outcome.kind === 'confirmed';
  session.status = outcome.kind === 'confirmed' ? 'stopped' : 'unknown';
  if (session.input?.status === 'pending') {
    session.input.status = 'unknown';
    notify({ type: 'input', sessionId: session.id, input: inputView(session.input) });
  }
  if (registry) {
    try { registry.save(session); } catch (error) { session.status = 'unknown'; throw error; }
  }
  notify({ type: 'session', session: sessionView(session) });
  return outcome.kind;
}

export async function stopAllHarnessSessions(
  port: HarnessPort,
  sessions: Iterable<SessionRecord>,
  notify: (event: CoreEvent) => void,
  registry?: NativeRegistry,
): Promise<ShutdownResult> {
  const stoppedSessionIds: string[] = [];
  const uncertainSessionIds: string[] = [];
  const failedSessionIds: string[] = [];
  for (const session of sessions) {
    if (session.status === 'stopped' || (session.status === 'failed' && !registry)) continue;
    let outcome: PortOutcome['kind'];
    try { outcome = await stopHarnessSession(port, session, notify, registry); }
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
