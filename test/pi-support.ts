import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import type { HarnessEvent } from '../src/contracts.ts';
import { createPiHarness } from '../src/pi-harness.ts';
import { allowanceMs, phaseTrace, until } from './pi-observation.ts';

import { fixtureHealth } from './pi-fixture-health.ts';
import { hostCloseEvidence } from './pi-host-close.ts';
export { boundary, message, settled, final } from './pi-records.ts';
export async function fixture(t: TestContext, flags: string[] = [], commandDeadlineMs = allowanceMs,
  observationMs = allowanceMs) {
  const trace = phaseTrace();
  const health = fixtureHealth();
  const host = hostCloseEvidence();
  const raw = createPiHarness({ executable: process.execPath,
    prefixArgs: [fileURLToPath(new URL('./pi-child.ts', import.meta.url)), ...flags, trace.flag],
    commandDeadlineMs, stopDeadlineMs: 2_000,
  });
  const events: HarnessEvent[] = [];
  const ids = new Set<string>();
  const usable = new Set<string>();
  const confirmed = new Set<string>();
  const outcomes: string[] = [];
  const fences = new Set<string>();
  const fenceTokens = new Set<string>();
  let sequence = 0;
  const diagnostics = () => `outcomes=${outcomes.join(',')}; phases=${trace.phases().join(',')}`;
  const observe = (predicate: () => boolean, phase = 'wire event', timeoutMs = observationMs) =>
    health.run('observation', () => until(predicate, phase, timeoutMs, diagnostics));
  t.after(async () => {
    try {
      const uncertain: string[] = [];
      for (const id of ids) {
        try {
          let result = await raw.stop(id);
          if (result.kind === 'unknown') result = await raw.stop(id);
          if (result.kind !== 'confirmed') uncertain.push(id);
        } catch { uncertain.push(id); }
      }
      await host.closed();
      assert.equal(uncertain.length, 0, `owned child cleanup; ${diagnostics()}`);
      t.diagnostic('owned host cleanup confirmed');
    } finally { trace.cleanup(); health.assertHealthy(); }
  });
  async function rawStart(id = 's', emit: (event: HarnessEvent) => void = event => events.push(event)) {
    ids.add(id); // Ownership is registered before setup can fail.
    const result = await host.start(() => raw.start(id, event => {
      if (event.type === 'text' && fenceTokens.has(event.text)) {
        fences.add(event.text); return;
      }
      if (event.type === 'input-failed' && event.certainty === 'unknown') usable.delete(id);
      emit(event);
    }));
    outcomes.push(`start:${result.kind}`);
    if (result.kind === 'confirmed') { usable.add(id); confirmed.add(id); }
    return result;
  }
  const port = health.wrap({
    async start(id, emit) {
      const result = await rawStart(id, emit);
      assert.equal(result.kind, 'confirmed', `readiness phase; ${diagnostics()}`);
      return result;
    },
    async send(id, input, text) {
      assert.ok(confirmed.has(id), `send requires confirmed readiness; ${diagnostics()}`);
      const exercise = usable.has(id);
      const fence = `fixture-fence:${++sequence}`;
      fenceTokens.add(fence);
      const scenario = exercise ? JSON.parse(text) : {};
      const gate = scenario.raw || scenario.invalidUtf8 || scenario.exit || scenario.eof
        ? `gate-${sequence}` : undefined;
      const payload = exercise ? JSON.stringify({ ...scenario, fixtureFence: fence, fixtureGate: gate }) : text;
      const result = await raw.send(id, input, payload);
      outcomes.push(`send:${result.kind}`);
      if (result.kind === 'unknown') usable.delete(id);
      if (exercise) await observe(() => trace.count(`prompt:${fence}`) === 1, 'prompt reached child');
      if (exercise && !scenario.noAck && !scenario.delayAck && !scenario.exitBeforeAck
        && !scenario.wrongCommand) {
        await observe(() => fences.has(fence), 'prompt records consumed');
        if (gate) trace.release(gate);
      }
      return result;
    },
    async stop(id) { usable.delete(id); return raw.stop(id); },
  });
  const start = (id = 's') => port.start(id, event => events.push(event));
  const send = (scenario: object, input = 'i', session = 's') =>
    port.send(session, input, JSON.stringify(scenario));
  const rawSend = (scenario: object) => raw.send('s', 'i', JSON.stringify(scenario));
  return { port, events, start, send, ids, rawStart, rawSend, until: observe,
    assertHealthy: health.assertHealthy, closed: host.closed, gate: trace.gate,
    phase: (phase: string) => observe(() => trace.count(phase) > 0, `child ${phase}`),
    phases: trace.phases };
}
