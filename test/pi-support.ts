import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import type { HarnessEvent } from '../src/contracts.ts';
import { createPiHarness } from '../src/pi-harness.ts';

export const boundary = { type: 'agent_start' };
export const message = (stopReason: string) => ({
  type: 'message_end', message: { role: 'assistant', stopReason, content: 'private duplicate' },
});
export const settled = (aborted: unknown = false) => ({ type: 'agent_settled', aborted });
export const final = (reason = 'stop', aborted: unknown = false) => [
  boundary, message(reason), { type: 'agent_end', willRetry: false }, settled(aborted),
];
export async function fixture(t: TestContext, flags: string[] = [], deadline = 300) {
  const port = createPiHarness({ executable: process.execPath,
    prefixArgs: [fileURLToPath(new URL('./pi-child.ts', import.meta.url)), ...flags],
    commandDeadlineMs: deadline, stopDeadlineMs: 100,
  });
  const events: HarnessEvent[] = [];
  const ids = new Set<string>();
  t.after(async () => {
    for (const id of ids) {
      let result = await port.stop(id);
      if (result.kind === 'unknown') result = await port.stop(id);
      assert.equal(result.kind, 'confirmed', `fixture child cleanup ${id}`);
    }
  });
  async function start(id = 's') {
    ids.add(id);
    return port.start(id, (event) => events.push(event));
  }
  async function send(scenario: object, input = 'i', session = 's') {
    return port.send(session, input, JSON.stringify(scenario));
  }
  return { port, events, start, send, ids };
}
export async function until(predicate: () => boolean) {
  for (let i = 0; i < 100 && !predicate(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.ok(predicate(), 'expected wire observation');
}
