import type { HarnessEvent, HarnessPort, NativeBinding, PortOutcome } from './types.ts';
import { launchPi, trackPiExit, type PiLaunch } from './pi-process.ts';
import { createPiWire, object } from './pi-wire.ts';
import { createPiRun } from './pi-run.ts';
import { createPiQuestions } from './pi-questions.ts';
import { checkNative } from './native-history.ts';
export type { PiLaunch } from './pi-process.ts';

/** Trusted native Pi 1.5 launch; text is RPC data, never shell arguments. */
export function createPiHarness(config: PiLaunch = {}): HarnessPort {
  const sessions = new Map<string, ReturnType<typeof session>>();
  const deadline = config.commandDeadlineMs ?? 10_000;
  const stopDeadline = config.stopDeadlineMs ?? 5_000;
  for (const value of [deadline, stopDeadline]) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError('invalid deadline');
  }
  function session(emit: (event: HarnessEvent) => void, native?: NativeBinding) {
    if (native) checkNative(native, native.fresh);
    const child = launchPi(native ? { ...config, cwd: native.cwd } : config, native?.file);
    const exit = trackPiExit(child);
    let stopping = false;
    let ready = false;
    const publish = (event: HarnessEvent) => { if (!stopping) emit(event); };
    const run = createPiRun(publish);
    const questions = createPiQuestions(publish, record => wire.write(record));
    const wire = createPiWire(child, deadline, record => {
      questions.event(record);
      run.event(record);
    }, () => { questions.invalidate(); run.uncertain(); });
    return { child, exit, run, wire, questions,
      get ready() { return ready; },
      setReady() { ready = !stopping && !wire.broken && !exit.exited; },
      stop() { stopping = true; wire.fail(); return exit.stop(stopDeadline); },
    };
  }
  return {
    async start(sessionId, emit, native) {
      const previous = sessions.get(sessionId);
      if (previous && (!native || !previous.exit.exited)) return { kind: 'rejected' };
      let owned: ReturnType<typeof session>;
      try { owned = session(emit, native); } catch { return { kind: 'unknown' }; }
      sessions.set(sessionId, owned);
      const response = await owned.wire.command('get_state');
      if (!response) return { kind: 'unknown' };
      const state = object(response.data);
      if (response.success !== true || typeof state.isStreaming !== 'boolean'
        || typeof state.sessionId !== 'string') return { kind: 'unknown' };
      if (native) {
        try {
          const nativeId = checkNative(native);
          if (state.sessionId !== nativeId || state.sessionFile !== native.file) return { kind: 'unknown' };
        } catch { return { kind: 'unknown' }; }
      }
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
    async cancel(sessionId, inputId) {
      const owned = sessions.get(sessionId);
      if (!owned) return { kind: 'rejected' };
      if (!owned.ready || owned.wire.broken || owned.exit.exited) return { kind: 'unknown' };
      return owned.run.cancel(inputId, () => owned.wire.command('abort'));
    },
    async reply(sessionId, answer) {
      const owned = sessions.get(sessionId);
      if (!owned) return { kind: 'rejected' };
      if (owned.wire.broken || owned.exit.exited) return { kind: 'unknown' };
      return owned.questions.reply(answer);
    },
    async stop(sessionId) {
      const owned = sessions.get(sessionId);
      if (!owned) return { kind: 'rejected' };
      return owned.stop();
    },
  };
}
