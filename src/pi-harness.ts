import type { HarnessEvent, HarnessPort, PortOutcome } from './contracts.ts';
import { launchPi, trackPiExit, type PiLaunch } from './pi-process.ts';
import { createPiWire, object } from './pi-wire.ts';
import { createPiRun } from './pi-run.ts';
export type { PiLaunch } from './pi-process.ts';

/** Trusted native Pi 1.5 launch; text is RPC data, never shell arguments. */
export function createPiHarness(config: PiLaunch = {}): HarnessPort {
  const sessions = new Map<string, ReturnType<typeof session>>();
  const deadline = config.commandDeadlineMs ?? 10_000;
  const stopDeadline = config.stopDeadlineMs ?? 5_000;
  for (const value of [deadline, stopDeadline]) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError('invalid deadline');
  }
  function session(emit: (event: HarnessEvent) => void) {
    const child = launchPi(config);
    const exit = trackPiExit(child);
    let stopping = false;
    let ready = false;
    const run = createPiRun((event) => { if (!stopping) emit(event); });
    const wire = createPiWire(child, deadline, run.event, run.uncertain);
    return { child, exit, run, wire,
      get ready() { return ready; },
      setReady() { ready = !stopping && !wire.broken && !exit.exited; },
      stop() { stopping = true; wire.fail(); return exit.stop(stopDeadline); },
    };
  }
  return {
    async start(sessionId, emit) {
      if (sessions.has(sessionId)) return { kind: 'rejected' };
      let owned: ReturnType<typeof session>;
      try { owned = session(emit); } catch { return { kind: 'unknown' }; }
      sessions.set(sessionId, owned);
      const response = await owned.wire.command('get_state');
      if (!response) return { kind: 'unknown' };
      const state = object(response.data);
      if (response.success !== true || typeof state.isStreaming !== 'boolean'
        || typeof state.sessionId !== 'string') return { kind: 'unknown' };
      owned.setReady();
      return { kind: owned.ready ? 'confirmed' : 'unknown' };
    },
    async send(sessionId, inputId, text) {
      const owned = sessions.get(sessionId);
      if (!owned?.ready || owned.wire.broken || owned.exit.exited) return { kind: 'unknown' };
      const input = owned.run.begin(inputId);
      if (!input) return { kind: 'unknown' };
      let outcome: PortOutcome = { kind: 'unknown' };
      const response = await owned.wire.command('prompt', { message: text }, (record) => {
        outcome = owned.run.acknowledge(input, record);
      });
      if (!response) { owned.run.uncertain(); return { kind: 'unknown' }; }
      return outcome;
    },
    async stop(sessionId) {
      const owned = sessions.get(sessionId);
      if (!owned) return { kind: 'rejected' };
      return owned.stop();
    },
  };
}
