import { CoreError, type HarnessEvent, type HarnessPort } from './types.ts';
import { launchClaude, trackClaudeExit, type ClaudeLaunch } from './claude-process.ts';
import { createClaudeWire, claudeObject } from './claude-wire.ts';
import { createClaudeEvents } from './claude-events.ts';
export type { ClaudeLaunch } from './claude-process.ts';

/** Lazy, independent native stream-json channel per local session ID. */
export function createClaudeHarness(config: ClaudeLaunch = {}): HarnessPort {
  const deadline = config.stopDeadlineMs ?? 5_000;
  if (!Number.isFinite(deadline) || deadline <= 0) throw new RangeError('invalid deadline');
  const sessions = new Map<string, ReturnType<typeof session>>();
  function session(emit: (event: HarnessEvent) => void) {
    const child = launchClaude(config);
    const exit = trackClaudeExit(child);
    let stopping = false;
    let ready = false;
    const display = createClaudeEvents(event => {
      if (!stopping && !wire.broken) emit(event);
    });
    const wire = createClaudeWire(child, display.event, display.clear);
    return {
      wire,
      get ready() { return ready && !stopping && !wire.broken && !exit.exited; },
      setReady() { ready = true; },
      stop() { stopping = true; wire.fail(); return exit.stop(deadline); },
    };
  }
  return {
    async start(sessionId, emit) {
      if (sessions.has(sessionId)) return { kind: 'rejected' };
      let owned: ReturnType<typeof session>;
      try { owned = session(emit); } catch { return { kind: 'unknown' }; }
      sessions.set(sessionId, owned);
      // Reader and all loss/exit observers are installed before the first write.
      const answer = await owned.wire.command({
        type: 'control_request', request: { subtype: 'initialize', hooks: null },
      });
      if (!answer) return { kind: 'unknown' };
      const response = claudeObject(answer.response);
      if (response?.subtype === 'error') return { kind: 'rejected' };
      owned.setReady();
      return { kind: owned.ready ? 'confirmed' : 'unknown' };
    },
    async command(sessionId, command) {
      const owned = sessions.get(sessionId);
      if (!owned?.ready) {
        if (command.type === 'control_request') return null;
        throw new CoreError('harness-unknown');
      }
      return owned.wire.command(command);
    },
    async stop(sessionId) {
      const owned = sessions.get(sessionId);
      if (!owned) return { kind: 'rejected' };
      return owned.stop();
    },
  };
}
