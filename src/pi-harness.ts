import type { HarnessEvent, HarnessPort, NativeResponse } from './types.ts';
import { launchPi, trackPiExit, type PiLaunch } from './pi-process.ts';
import { createPiWire, object } from './pi-wire.ts';
import { createPiQuestions } from './pi-questions.ts';
export type { PiLaunch } from './pi-process.ts';

/** Trusted native Pi 1.5 launch; text is RPC data, never shell arguments. */
export function createPiHarness(config: PiLaunch = {}): HarnessPort {
  const sessions = new Map<string, ReturnType<typeof session>>();
  const stopDeadline = config.stopDeadlineMs ?? 5_000;
  if (!Number.isFinite(stopDeadline) || stopDeadline <= 0) throw new RangeError('invalid deadline');
  function session(emit: (event: HarnessEvent) => void) {
    const child = launchPi(config);
    const exit = trackPiExit(child);
    let stopping = false;
    let ready = false;
    const publish = (event: HarnessEvent) => { if (!stopping && !wire.broken) emit(event); };
    const questions = createPiQuestions(publish, record => wire.write(record));
    const wire = createPiWire(child, record => {
      questions.event(record);
      const delta = object(record.assistantMessageEvent);
      if (record.type === 'message_update' && delta.type === 'text_delta' && typeof delta.delta === 'string') {
        publish({ type: 'text', text: delta.delta });
      }
    }, () => questions.invalidate());
    return { exit, wire, questions,
      get ready() { return ready && !stopping && !wire.broken && !exit.exited; },
      setReady() { ready = true; },
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
      if (response?.success !== true || typeof response.data !== 'object'
        || response.data === null || Array.isArray(response.data)) return { kind: 'unknown' };
      owned.setReady();
      return { kind: owned.ready ? 'confirmed' : 'unknown' };
    },
    async command(sessionId, command) {
      const owned = sessions.get(sessionId);
      if (!owned?.ready) return null;
      return await owned.wire.command(command.type, command) as NativeResponse | null;
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
