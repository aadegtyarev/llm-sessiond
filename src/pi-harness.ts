import { randomUUID } from 'node:crypto';
import { createPiControls } from './pi-controls.ts';
import type { HarnessEvent, HarnessPort, NativeBinding, PortOutcome } from './types.ts';
import { launchPi, trackPiExit, type PiLaunch } from './pi-process.ts';
import { createPiWire, object } from './pi-wire.ts';
import { createPiRun } from './pi-run.ts';
import { createPiQuestions } from './pi-questions.ts';
import { checkNative } from './native-history.ts';
import { nativeStartupSelection } from './native-startup.ts';
import { restoreNativeSettings } from './pi-startup.ts';
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
    const selection = native && nativeStartupSelection(native);
    const reloadCommand = `llm-sessiond-reload-${randomUUID()}`;
    const child = launchPi(native ? { ...config, cwd: native.cwd } : config, native?.file, reloadCommand);
    const exit = trackPiExit(child);
    let stopping = false;
    let ready = false;
    let forwarding = true;
    let startupError = false;
    let startupConflict = false;
    let identity: ReturnType<typeof object> = {};
    const publish = (event: HarnessEvent) => { if (!stopping && forwarding) emit(event); };
    const run = createPiRun(publish);
    const questions = createPiQuestions(publish, record => wire.write(record));
    const wire = createPiWire(child, deadline, record => {
      if (!ready && record.type === 'extension_error') startupError = true;
      if (!ready && ['agent_start', 'auto_compaction_start'].includes(String(record.type))) startupConflict = true;
      controls.event(record);
      questions.event(record);
      run.event(record);
    }, () => { questions.invalidate(); run.uncertain(); });
    function lostOwnership() {
      ready = false;
      wire.fail(); // Broken before callbacks: preserve OWN run uncertainty, never following foreign frames.
      forwarding = false;
    }
    async function state() {
      const settleQuestions = questions.barrier();
      const response = await wire.command('get_state', {}, record => {
        if (record.success !== true || !native) return;
        const state = object(record.data);
        try {
          const nativeId = checkNative(native);
          if ((typeof state.sessionId === 'string' && state.sessionId !== nativeId)
            || (typeof state.sessionFile === 'string' && state.sessionFile !== native.file)) lostOwnership();
        } catch { lostOwnership(); }
      });
      if (response?.success !== true) return null;
      const value = object(response.data);
      if (typeof value.isStreaming !== 'boolean' || typeof value.sessionId !== 'string') return null;
      if (native) {
        try {
          if (value.sessionId !== checkNative(native) || value.sessionFile !== native.file) return null;
        } catch { lostOwnership(); return null; }
      }
      if (value.isStreaming === false && value.isCompacting === false && value.pendingMessageCount === 0
        && run.idle && questions.controlAdmissible) settleQuestions();
      return value;
    }
    const safe = (state: ReturnType<typeof object>) => !stopping && forwarding && !wire.broken && !exit.exited
      && !startupError && !startupConflict && run.idle && questions.quiescent
      && state.isStreaming === false && state.isCompacting === false && state.pendingMessageCount === 0;
    const controls = createPiControls({ wire,
      get ready() { return ready && !stopping && !exit.exited; },
      get idle() { return run.idle; },
      get questionsAdmissible() { return questions.controlAdmissible; },
      get questionsQuiescent() { return questions.quiescent; },
      questionBarrier: () => questions.barrier(),
      identity: () => identity,
      uncertain() { run.uncertain(); questions.invalidate(); }, lostOwnership,
    }, reloadCommand);
    return { child, exit, run, wire, questions, controls, selection, state, safe,
      identify(state: ReturnType<typeof object>) { identity = { sessionId: state.sessionId, sessionFile: state.sessionFile }; },
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
      const state = await owned.state();
      if (!state) return { kind: 'unknown' };
      if (native) {
        try {
          const nativeId = checkNative(native);
          if (state.sessionId !== nativeId || state.sessionFile !== native.file) return { kind: 'unknown' };
        } catch { return { kind: 'unknown' }; }
      }
      if (owned.selection && (owned.selection.modelChange || owned.selection.responseModel || owned.selection.thinkingLevel !== undefined)) {
        if (!await restoreNativeSettings(owned.selection, owned)) return { kind: 'unknown' };
      }
      owned.identify(state);
      owned.setReady();
      return { kind: owned.ready ? 'confirmed' : 'unknown' };
    },
    async send(sessionId, inputId, text) {
      const owned = sessions.get(sessionId);
      if (!owned?.ready || owned.wire.broken || owned.exit.exited) return { kind: 'unknown' };
      if (owned.controls.exclusive) return { kind: 'rejected' };
      const input = owned.run.begin(inputId);
      if (!input) return { kind: 'unknown' };
      owned.controls.beginOrdinary();
      try {
        let outcome: PortOutcome = { kind: 'unknown' };
        const response = await owned.wire.command('prompt', { message: text }, (record) => {
          outcome = owned.run.acknowledge(input, record);
        });
        if (!response) { owned.run.uncertain(); return { kind: 'unknown' }; }
        return outcome;
      } finally { owned.controls.endOrdinary(); }
    },
    async cancel(sessionId, inputId) {
      const owned = sessions.get(sessionId);
      if (!owned || owned.controls.exclusive) return { kind: 'rejected' };
      if (!owned.ready || owned.wire.broken || owned.exit.exited) return { kind: 'unknown' };
      owned.controls.beginOrdinary();
      try { return await owned.run.cancel(inputId, () => owned.wire.command('abort')); }
      finally { owned.controls.endOrdinary(); }
    },
    async reply(sessionId, answer) {
      const owned = sessions.get(sessionId);
      if (!owned || owned.controls.exclusive) return { kind: 'rejected' };
      if (owned.wire.broken || owned.exit.exited) return { kind: 'unknown' };
      owned.controls.beginOrdinary();
      try { return await owned.questions.reply(answer); }
      finally { owned.controls.endOrdinary(); }
    },
    async models(id) { return sessions.get(id)?.controls.models() ?? { kind: 'rejected' }; },
    async settings(id) { return sessions.get(id)?.controls.settings() ?? { kind: 'rejected' }; },
    async setModel(id, choice) { return sessions.get(id)?.controls.setModel(choice) ?? { kind: 'rejected' }; },
    async setThinkingLevel(id, level) { return sessions.get(id)?.controls.setThinkingLevel(level) ?? { kind: 'rejected' }; },
    async reload(id) { return sessions.get(id)?.controls.reload() ?? { kind: 'rejected' }; },
    async compact(id, instructions) { return sessions.get(id)?.controls.compact(instructions) ?? { kind: 'rejected' }; },
    async stop(sessionId) {
      const owned = sessions.get(sessionId);
      if (!owned) return { kind: 'rejected' };
      return owned.stop();
    },
  };
}
