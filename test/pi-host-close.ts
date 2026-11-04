import { channel } from 'node:diagnostics_channel';
import type { ChildProcess } from 'node:child_process';
import { until } from './pi-observation.ts';

// Node 24 child_process diagnostic publishes the owned child at construction.
// Observe close, not merely exit: all adapter stdio readers are then closed.
export function hostCloseEvidence() {
  const children: { closed: boolean }[] = [];
  function start<T>(operation: () => T): T {
    const diagnostic = channel('child_process');
    const capture = (value: unknown) => {
      const child = (value as { process: ChildProcess }).process;
      const state = { closed: false };
      children.push(state);
      child.once('close', () => { state.closed = true; });
    };
    diagnostic.subscribe(capture);
    try { return operation(); }
    finally { diagnostic.unsubscribe(capture); }
  }
  const closed = () => until(() => children.length > 0 && children.every(child => child.closed),
    'owned host stdio close');
  return { start, closed };
}
